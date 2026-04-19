/**
 * Reconnector — schedules reconnect attempts with exponential backoff.
 *
 * Usage:
 *   const rc = new Reconnector({ onReconnect: () => connect() });
 *   rc.schedule();   // call after a disconnect
 *   rc.reset();      // call after a successful connect
 *   rc.stop();       // call on intentional close
 */
export class Reconnector {
  #timerId    = null;
  #attempt    = 0;
  #stopped    = false;
  #delay;
  #maxDelay;
  #onReconnect;

  /**
   * @param {object}     opts
   * @param {number}     opts.delay        - initial delay ms (default 1 000)
   * @param {number}     opts.maxDelay     - cap ms (default 30 000)
   * @param {() => void} opts.onReconnect  - called when it's time to reconnect
   */
  constructor({ delay = 1_000, maxDelay = 30_000, onReconnect } = {}) {
    this.#delay       = delay;
    this.#maxDelay    = maxDelay;
    this.#onReconnect = onReconnect ?? (() => {});
  }

  /** Schedule the next reconnect attempt. */
  schedule() {
    if (this.#stopped || this.#timerId !== null) return;
    const wait = Math.min(this.#delay * 2 ** this.#attempt, this.#maxDelay);
    this.#attempt++;
    this.#timerId = setTimeout(() => {
      this.#timerId = null;
      if (!this.#stopped) this.#onReconnect();
    }, wait);
  }

  /** Reset backoff counter after a successful connection. */
  reset() {
    clearTimeout(this.#timerId);
    this.#timerId = null;
    this.#attempt = 0;
  }

  /** Permanently stop reconnecting. */
  stop() {
    this.#stopped = true;
    clearTimeout(this.#timerId);
    this.#timerId = null;
  }
}
