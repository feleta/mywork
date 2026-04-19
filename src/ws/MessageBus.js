/**
 * MessageBus — wraps a raw WebSocket to provide Promise-based request/response.
 *
 * Protocol: every outgoing message gets a unique reqId.
 * The server must echo that reqId back in its response.
 * Push messages (no reqId match) are dispatched to registered handlers.
 */
export class MessageBus {
  #pending = new Map();   // reqId -> { resolve, reject, timer }
  #handlers = new Map();  // type -> Set<fn>

  /** Call this with every raw string received from the socket. */
  receive(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // resolve a pending request
    if (msg.reqId && this.#pending.has(msg.reqId)) {
      const { resolve, timer } = this.#pending.get(msg.reqId);
      clearTimeout(timer);
      this.#pending.delete(msg.reqId);
      resolve(msg);
      return;
    }

    // dispatch push message to subscribers
    const handlers = this.#handlers.get(msg.type);
    if (handlers) handlers.forEach(fn => fn(msg));
  }

  /**
   * Send a request and return a Promise that resolves with the server response.
   * @param {WebSocket} socket  - live WebSocket instance
   * @param {object}    payload - message body (must not contain reqId)
   * @param {number}    timeout - ms before rejecting
   */
  request(socket, payload, timeout = 10_000) {
    return new Promise((resolve, reject) => {
      const reqId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.#pending.delete(reqId);
        reject(new Error(`WsClient request timeout (reqId=${reqId})`));
      }, timeout);
      this.#pending.set(reqId, { resolve, reject, timer });
      socket.send(JSON.stringify({ reqId, ...payload }));
    });
  }

  /** Subscribe to server-push messages by type. */
  on(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(handler);
  }

  off(type, handler) {
    this.#handlers.get(type)?.delete(handler);
  }

  /** Reject all pending requests (e.g. on disconnect). */
  rejectAll(reason) {
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer);
      reject(new Error(reason));
    }
    this.#pending.clear();
  }
}
