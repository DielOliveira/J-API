import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const PUBLIC_COLUMNS = `id, session, type, phone, status, attempts, created_at AS createdAt,
  available_at AS availableAt, sent_at AS sentAt, whatsapp_message_id AS whatsappMessageId,
  last_error AS lastError`;

export class QueueStore {
  constructor(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
    this.database = new Database(databasePath);
    fs.chmodSync(databasePath, 0o600);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        session TEXT NOT NULL,
        type TEXT NOT NULL,
        phone TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        available_at INTEGER NOT NULL,
        sent_at INTEGER,
        whatsapp_message_id TEXT,
        last_error TEXT,
        idempotency_key TEXT,
        UNIQUE (session, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(session, status, available_at, created_at);
      CREATE INDEX IF NOT EXISTS jobs_sent ON jobs(session, status, sent_at);
    `);
    this.database.prepare("UPDATE jobs SET status = 'pending', available_at = ?, last_error = 'service restarted during processing' WHERE status = 'processing'").run(Date.now());
  }

  enqueue(job) {
    const existing = job.idempotencyKey ? this.getByIdempotencyKey(job.session, job.idempotencyKey) : null;
    if (existing) return { job: existing, duplicate: true };
    this.database.prepare(`INSERT INTO jobs
      (id, session, type, phone, payload, status, created_at, available_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
      job.id, job.session, job.type, job.phone, JSON.stringify(job.payload), job.createdAt, job.createdAt,
      job.idempotencyKey ?? null
    );
    return { job: this.get(job.id), duplicate: false };
  }

  getByIdempotencyKey(session, key) {
    return this.database.prepare(`SELECT ${PUBLIC_COLUMNS} FROM jobs WHERE session = ? AND idempotency_key = ?`).get(session, key) ?? null;
  }

  get(id) {
    return this.database.prepare(`SELECT ${PUBLIC_COLUMNS} FROM jobs WHERE id = ?`).get(id) ?? null;
  }

  payload(id) {
    const row = this.database.prepare('SELECT payload FROM jobs WHERE id = ?').get(id);
    return row ? JSON.parse(row.payload) : null;
  }

  list(session, limit = 100) {
    return this.database.prepare(`SELECT ${PUBLIC_COLUMNS} FROM jobs WHERE session = ? ORDER BY created_at DESC LIMIT ?`).all(session, limit);
  }

  listBetween(session, start, end) {
    return this.database.prepare(`SELECT ${PUBLIC_COLUMNS} FROM jobs
      WHERE session = ? AND created_at >= ? AND created_at < ?
      ORDER BY created_at DESC`).all(session, start, end);
  }

  countActive(session) {
    return this.database.prepare("SELECT count(*) AS total FROM jobs WHERE session = ? AND status IN ('pending', 'processing')").get(session).total;
  }

  claimNext(session, now = Date.now()) {
    return this.database.transaction(() => {
      const row = this.database.prepare("SELECT id FROM jobs WHERE session = ? AND status = 'pending' AND available_at <= ? ORDER BY created_at, id LIMIT 1").get(session, now);
      if (!row) return null;
      this.database.prepare("UPDATE jobs SET status = 'processing', attempts = attempts + 1, last_error = NULL WHERE id = ? AND status = 'pending'").run(row.id);
      return this.get(row.id);
    })();
  }

  nextPending(session, now = Date.now()) {
    return this.database.prepare("SELECT id, phone FROM jobs WHERE session = ? AND status = 'pending' AND available_at <= ? ORDER BY created_at, id LIMIT 1").get(session, now) ?? null;
  }

  contactWasSent(session, phone, since) {
    return Boolean(this.database.prepare("SELECT 1 FROM jobs WHERE session = ? AND phone = ? AND status = 'sent' AND sent_at >= ? LIMIT 1").get(session, phone, since));
  }

  markSent(id, messageId, now = Date.now()) {
    this.database.prepare("UPDATE jobs SET status = 'sent', sent_at = ?, whatsapp_message_id = ?, last_error = NULL WHERE id = ?").run(now, messageId, id);
  }

  retry(id, availableAt, error) {
    this.database.prepare("UPDATE jobs SET status = 'pending', available_at = ?, last_error = ? WHERE id = ?").run(availableAt, String(error).slice(0, 500), id);
  }

  fail(id, error) {
    this.database.prepare("UPDATE jobs SET status = 'failed', last_error = ? WHERE id = ?").run(String(error).slice(0, 500), id);
  }

  sentStats(session, hourStart, dayStart) {
    const hourly = this.database.prepare("SELECT count(*) AS messages, count(DISTINCT phone) AS contacts, min(sent_at) AS oldest FROM jobs WHERE session = ? AND status = 'sent' AND sent_at >= ?").get(session, hourStart);
    const daily = this.database.prepare("SELECT count(*) AS messages, min(sent_at) AS oldest FROM jobs WHERE session = ? AND status = 'sent' AND sent_at >= ?").get(session, dayStart);
    return { hourly, daily };
  }

  close() {
    this.database.close();
  }
}
