import { randomUUID } from 'node:crypto';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class PersistentSendQueue {
  #running = false;
  #closed = false;
  #timer = null;
  #drainPromise = null;
  #nextWakeDelay = null;

  constructor({ store, session, send, logger = console, limits }) {
    this.store = store;
    this.session = session;
    this.send = send;
    this.logger = logger;
    this.limits = limits;
  }

  get size() {
    return this.store.countActive(this.session);
  }

  add({ type, phone, payload, idempotencyKey }) {
    if (this.#closed) throw new Error('send queue is shutting down');
    const existing = idempotencyKey ? this.store.getByIdempotencyKey(this.session, idempotencyKey) : null;
    if (existing) return { job: existing, duplicate: true };
    if (this.size >= this.limits.maxQueueSize) throw new Error('send queue is full');
    const result = this.store.enqueue({
      id: randomUUID(), session: this.session, type, phone, payload,
      idempotencyKey, createdAt: Date.now()
    });
    this.#wake();
    return result;
  }

  get(id) {
    const job = this.store.get(id);
    return job?.session === this.session ? job : null;
  }

  list(limit) {
    return this.store.list(this.session, limit);
  }

  start() {
    this.#wake();
  }

  async close() {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    await this.#drainPromise;
  }

  #wake(delay = 0) {
    if (this.#closed) return;
    if (this.#running) {
      this.#nextWakeDelay = this.#nextWakeDelay === null ? delay : Math.min(this.#nextWakeDelay, delay);
      return;
    }
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#drainPromise = this.#drain().finally(() => { this.#drainPromise = null; });
    }, delay);
    this.#timer.unref?.();
  }

  #limitDelay(now, phone) {
    const hourStart = now - 3_600_000;
    const dayStart = now - 86_400_000;
    const { hourly, daily } = this.store.sentStats(this.session, hourStart, dayStart);
    const waits = [];
    const newHourlyContact = !this.store.contactWasSent(this.session, phone, hourStart);
    const sendsPerHourReached = this.limits.maxSendsPerHour > 0 && hourly.messages >= this.limits.maxSendsPerHour;
    const contactsPerHourReached = this.limits.maxContactsPerHour > 0
      && newHourlyContact
      && hourly.contacts >= this.limits.maxContactsPerHour;
    if (sendsPerHourReached || contactsPerHourReached) {
      waits.push((hourly.oldest + 3_600_000) - now);
    }
    if (this.limits.maxSendsPerDay > 0 && daily.messages >= this.limits.maxSendsPerDay) {
      waits.push((daily.oldest + 86_400_000) - now);
    }
    return waits.length ? Math.max(1000, ...waits) : 0;
  }

  async #drain() {
    if (this.#closed || this.#running) return;
    this.#running = true;
    try {
      while (!this.#closed) {
        const now = Date.now();
        const next = this.store.nextPending(this.session, now);
        if (!next) {
          this.#wake(this.limits.pollMs);
          return;
        }
        const limitedFor = this.#limitDelay(now, next.phone);
        if (limitedFor > 0) {
          this.#wake(Math.min(limitedFor, 60_000));
          return;
        }
        const job = this.store.claimNext(this.session, now);
        try {
          const messageId = await this.send(job, this.store.payload(job.id));
          this.store.markSent(job.id, messageId);
          this.logger.info(`[message] session=${this.session} sent job=${job.id} id=${messageId}`);
        } catch (error) {
          const permanent = /not registered|outside ALLOWED|does not exist|not a PDF|invalid/i.test(error.message);
          const disconnected = error.message === 'WhatsApp is not connected';
          if (permanent || (!disconnected && job.attempts >= this.limits.maxAttempts)) {
            this.store.fail(job.id, error.message);
            this.logger.error(`[message] session=${this.session} failed job=${job.id}: ${error.message}`);
          } else {
            const retryMs = Math.min(this.limits.retryMaxMs, this.limits.retryBaseMs * (2 ** Math.max(0, job.attempts - 1)));
            this.store.retry(job.id, Date.now() + retryMs, error.message);
            this.logger.warn?.(`[message] session=${this.session} retry job=${job.id} in=${retryMs}ms`);
          }
        }
        const spread = this.limits.delayMaxMs - this.limits.delayMinMs;
        await sleep(this.limits.delayMinMs + Math.floor(Math.random() * (spread + 1)));
      }
    } finally {
      this.#running = false;
      if (this.#nextWakeDelay !== null) {
        const delay = this.#nextWakeDelay;
        this.#nextWakeDelay = null;
        this.#wake(delay);
      }
    }
  }
}
