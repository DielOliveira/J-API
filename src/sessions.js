import fs from 'node:fs/promises';
import path from 'node:path';
import { SendQueue } from './queue.js';
import { WhatsAppClient } from './whatsapp.js';

const SESSION_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function validateSessionId(id) {
  if (typeof id !== 'string' || !SESSION_ID.test(id)) {
    throw new Error('session must use 1-32 lowercase letters, digits, underscores or hyphens');
  }
  return id;
}

export class SessionManager {
  #sessions = new Map();
  #creating = new Map();

  constructor({ rootPath, maxSessions, sendDelayMs, logger = console }) {
    this.rootPath = rootPath;
    this.maxSessions = maxSessions;
    this.sendDelayMs = sendDelayMs;
    this.logger = logger;
  }

  async start() {
    await fs.mkdir(this.rootPath, { recursive: true, mode: 0o700 });
    const entries = await fs.readdir(this.rootPath, { withFileTypes: true });
    const ids = entries
      .filter((entry) => entry.isDirectory() && SESSION_ID.test(entry.name))
      .map((entry) => entry.name)
      .slice(0, this.maxSessions);
    for (const id of ids) await this.get(id, { create: true });
    if (ids.length === 0) await this.get('default', { create: true });
  }

  list() {
    return [...this.#sessions.entries()].map(([id, entry]) => ({ id, ...entry.whatsapp.status(), queue: entry.queue.size }));
  }

  has(id) {
    validateSessionId(id);
    return this.#sessions.has(id);
  }

  async get(id, { create = false } = {}) {
    validateSessionId(id);
    const existing = this.#sessions.get(id);
    if (existing) return existing;
    if (!create) return null;
    if (this.#creating.has(id)) return this.#creating.get(id);
    if (this.#sessions.size + this.#creating.size >= this.maxSessions) {
      throw new Error(`maximum of ${this.maxSessions} sessions reached`);
    }

    const pending = this.#create(id).finally(() => this.#creating.delete(id));
    this.#creating.set(id, pending);
    return pending;
  }

  async #create(id) {
    const whatsapp = new WhatsAppClient({
      sessionPath: path.join(this.rootPath, id),
      logger: this.logger,
      logPrefix: `session=${id}`
    });
    const entry = { whatsapp, queue: new SendQueue(this.sendDelayMs) };
    await whatsapp.start();
    this.#sessions.set(id, entry);
    return entry;
  }

  async stop() {
    const entries = [...this.#sessions.values()];
    for (const entry of entries) entry.queue.close();
    await Promise.allSettled(entries.map((entry) => entry.whatsapp.stop()));
    this.#sessions.clear();
  }
}
