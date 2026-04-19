import { MessageBus }  from './MessageBus.js';
import { Heartbeat }   from './Heartbeat.js';
import { Reconnector } from './Reconnector.js';

/**
 * WsClient — Promise-style WebSocket client with heartbeat and auto-reconnect.
 *
 * Usage:
 *   const ws = new WsClient('ws://localhost:3001');
 *   const result = await ws.request({ action: 'broadcast', command: 'start' });
 *   ws.on('BROADCAST', msg => console.log(msg));
 *   ws.close();
 */
export class WsClient {
  #url;
  #opts;
  #socket   = null;
  #bus      = new MessageBus();
  #hb       = null;
  #rc       = null;
  #closed   = false;   // intentional close flag
  #statusCbs = new Set();

  /**
   * @param {string} url
   * @param {object} opts
   * @param {number} opts.heartbeatInterval  default 15 000 ms
   * @param {number} opts.heartbeatTimeout   default 5 000 ms
   * @param {number} opts.reconnectDelay     default 1 000 ms
   * @param {number} opts.maxReconnectDelay  default 30 000 ms
   * @param {number} opts.requestTimeout     default 10 000 ms
   */
  constructor(url, opts = {}) {
    this.#url  = url;
    this.#opts = {
      heartbeatInterval: 15_000,
      heartbeatTimeout:   5_000,
      reconnectDelay:     1_000,
      maxReconnectDelay: 30_000,
      requestTimeout:    10_000,
      ...opts,
    };

    this.#rc = new Reconnector({
      delay:       this.#opts.reconnectDelay,
      maxDelay:    this.#opts.maxReconnectDelay,
      onReconnect: () => this.#connect(),
    });

    this.#connect();
  }

  // ── public API ────────────────────────────────────────────────────────────

  /**
   * Send a request and await the server's response (Promise-style).
   * Rejects if the socket is not open or the request times out.
   */
  request(payload) {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WsClient: socket not open'));
    }
    return this.#bus.request(this.#socket, payload, this.#opts.requestTimeout);
  }

  /** Subscribe to server-push messages by type (e.g. 'BROADCAST'). */
  on(type, handler) {
    this.#bus.on(type, handler);
  }

  off(type, handler) {
    this.#bus.off(type, handler);
  }

  /** Subscribe to connection status changes: 'connecting' | 'open' | 'closed' */
  onStatus(cb) {
    this.#statusCbs.add(cb);
    return () => this.#statusCbs.delete(cb);
  }

  get readyState() {
    return this.#socket?.readyState ?? WebSocket.CLOSED;
  }

  /** Permanently close the connection (no reconnect). */
  close() {
    this.#closed = true;
    this.#hb?.stop();
    this.#rc?.stop();
    this.#socket?.close();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #connect() {
    if (this.#closed) return;
    this.#emit('connecting');

    const socket = new WebSocket(this.#url);
    this.#socket = socket;

    this.#hb = new Heartbeat(
      () => {
        // use a fire-and-forget ping request; pong handled via reqId resolution
        if (socket.readyState === WebSocket.OPEN) {
          this.#bus.request(socket, { action: 'ping' }, this.#opts.heartbeatTimeout)
            .then(() => this.#hb?.pong())
            .catch(() => {
              // pong timeout → force reconnect
              socket.close();
            });
        }
      },
      {
        interval:  this.#opts.heartbeatInterval,
        timeout:   this.#opts.heartbeatTimeout,
        onTimeout: () => socket.close(),
      }
    );

    socket.addEventListener('open', () => {
      this.#rc.reset();
      this.#hb.start();
      this.#emit('open');
    });

    socket.addEventListener('message', (e) => {
      this.#bus.receive(e.data);
    });

    socket.addEventListener('close', () => {
      this.#hb.stop();
      this.#bus.rejectAll('socket closed');
      this.#emit('closed');
      if (!this.#closed) this.#rc.schedule();
    });

    socket.addEventListener('error', () => {
      // 'close' fires right after 'error', so reconnect is handled there
    });
  }

  #emit(status) {
    this.#statusCbs.forEach(cb => cb(status));
  }
}
