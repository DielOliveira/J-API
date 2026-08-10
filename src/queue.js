export class SendQueue {
  #items = [];
  #running = false;
  #closed = false;

  constructor(delayMs = 1000) {
    this.delayMs = delayMs;
  }

  get size() {
    return this.#items.length + (this.#running ? 1 : 0);
  }

  add(task) {
    if (this.#closed) return Promise.reject(new Error('send queue is shutting down'));
    return new Promise((resolve, reject) => {
      this.#items.push({ task, resolve, reject });
      void this.#drain();
    });
  }

  close() {
    this.#closed = true;
    const error = new Error('send queue is shutting down');
    for (const item of this.#items.splice(0)) item.reject(error);
  }

  async #drain() {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.#items.length > 0) {
        const item = this.#items.shift();
        try {
          item.resolve(await item.task());
        } catch (error) {
          item.reject(error);
        }
        if (this.#items.length > 0 && this.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        }
      }
    } finally {
      this.#running = false;
    }
  }
}
