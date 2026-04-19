/**
 * Heartbeat — sends a ping at a fixed interval and calls onTimeout
 * if no pong is received within the timeout window.
 *
 * The caller is responsible for:
 *   - calling hb.pong() when a pong/ack arrives
 *   - calling hb.stop() on disconnect
 */
export class Heartbeat {
  #intervalId = null;
  #timeoutId  = null;
  #send;
  #interval;
  #timeout;
  #onTimeout;

  /**
   * @param {() => void} send       - function that sends a ping to the server
   * @param {object}     opts
   * @param {number}     opts.interval   - ms between pings (default 15 000)
   * @param {number}     opts.timeout    - ms to wait for pong (default 5 000)
   * @param {() => void} opts.onTimeout  - called when pong is not received in time
   */
  constructor(send, { interval = 15_000, timeout = 5_000, onTimeout } = {}) {
    this.#send      = send;
    this.#interval  = interval;
    this.#timeout   = timeout;
    this.#onTimeout = onTimeout ?? (() => {});
  }

  start() {
    this.stop();
    this.#intervalId = setInterval(() => this.#ping(), this.#interval);
  }

  stop() {
    clearInterval(this.#intervalId);
    clearTimeout(this.#timeoutId);
    this.#intervalId = null;
    this.#timeoutId  = null;
  }

  /** Call this when a pong response is received. */
  pong() {
    clearTimeout(this.#timeoutId);
    this.#timeoutId = null;
  }

  #ping() {
    this.#send();
    this.#timeoutId = setTimeout(() => {
      this.stop();
      this.#onTimeout();
    }, this.#timeout);
  }
}
