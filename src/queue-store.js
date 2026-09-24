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
      CREATE TABLE IF NOT EXISTS blocked_recipients (
        phone TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        blocked_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS blocked_recipients_date ON blocked_recipients(blocked_at DESC);
      CREATE TABLE IF NOT EXISTS message_monitors (
        session TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS monitored_messages (
        session TEXT NOT NULL,
        message_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
        message_type TEXT NOT NULL,
        text TEXT,
        content TEXT NOT NULL,
        message_at INTEGER NOT NULL,
        stored_at INTEGER NOT NULL,
        PRIMARY KEY (session, message_id)
      );
      CREATE INDEX IF NOT EXISTS monitored_messages_list
        ON monitored_messages(session, phone, message_at DESC, message_id DESC);
    `);
    const messageColumns = new Set(this.database.prepare('PRAGMA table_info(monitored_messages)').all().map((column) => column.name));
    if (!messageColumns.has('media_path')) this.database.exec('ALTER TABLE monitored_messages ADD COLUMN media_path TEXT');
    if (!messageColumns.has('media_mime')) this.database.exec('ALTER TABLE monitored_messages ADD COLUMN media_mime TEXT');
    if (!messageColumns.has('media_size')) this.database.exec('ALTER TABLE monitored_messages ADD COLUMN media_size INTEGER');
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

  blockRecipient(phone, reason, now = Date.now()) {
    this.database.prepare(`INSERT INTO blocked_recipients (phone, reason, blocked_at)
      VALUES (?, ?, ?) ON CONFLICT(phone) DO NOTHING`).run(phone, String(reason).slice(0, 500), now);
    return this.database.prepare('SELECT phone, reason, blocked_at AS blockedAt FROM blocked_recipients WHERE phone = ?').get(phone);
  }

  blockedRecipient(phones) {
    const candidates = [...new Set(phones)];
    if (candidates.length === 0) return null;
    const placeholders = candidates.map(() => '?').join(', ');
    return this.database.prepare(`SELECT phone, reason, blocked_at AS blockedAt FROM blocked_recipients
      WHERE phone IN (${placeholders}) ORDER BY blocked_at LIMIT 1`).get(...candidates) ?? null;
  }

  listBlockedRecipients() {
    return this.database.prepare(`SELECT phone, reason, blocked_at AS blockedAt FROM blocked_recipients
      ORDER BY blocked_at DESC, phone`).all();
  }

  unblockRecipient(phone) {
    return this.database.prepare('DELETE FROM blocked_recipients WHERE phone = ?').run(phone).changes > 0;
  }

  setMessageMonitor(session, phone, now = Date.now()) {
    this.database.prepare(`INSERT INTO message_monitors (session, phone, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session) DO UPDATE SET phone = excluded.phone, updated_at = excluded.updated_at`)
      .run(session, phone, now, now);
    return this.getMessageMonitor(session);
  }

  getMessageMonitor(session) {
    return this.database.prepare(`SELECT session, phone, created_at AS createdAt, updated_at AS updatedAt
      FROM message_monitors WHERE session = ?`).get(session) ?? null;
  }

  removeMessageMonitor(session) {
    return this.database.prepare('DELETE FROM message_monitors WHERE session = ?').run(session).changes > 0;
  }

  saveMonitoredMessage(message) {
    return this.database.prepare(`INSERT OR IGNORE INTO monitored_messages
      (session, message_id, phone, direction, message_type, text, content, message_at, stored_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      message.session, message.messageId, message.phone, message.direction, message.messageType,
      message.text, JSON.stringify(message.content), message.messageAt, message.storedAt
    ).changes > 0;
  }

  attachMonitoredMedia(session, messageId, media) {
    return this.database.prepare(`UPDATE monitored_messages SET media_path = ?, media_mime = ?, media_size = ?
      WHERE session = ? AND message_id = ?`).run(media.path, media.mime, media.size, session, messageId).changes > 0;
  }

  monitoredMessageMedia(session, messageId) {
    return this.database.prepare(`SELECT media_path AS path, media_mime AS mime, media_size AS size
      FROM monitored_messages WHERE session = ? AND message_id = ? AND media_path IS NOT NULL`).get(session, messageId) ?? null;
  }

  listMonitoredMessages(session, phone, limit = 100, before = Number.MAX_SAFE_INTEGER) {
    return this.database.prepare(`SELECT message_id AS messageId, session, phone, direction,
      message_type AS messageType, text, content, media_path IS NOT NULL AS hasMedia,
      message_at AS messageAt, stored_at AS storedAt
      FROM monitored_messages
      WHERE session = ? AND phone = ? AND message_at < ?
      ORDER BY message_at DESC, message_id DESC LIMIT ?`).all(session, phone, before, limit)
      .map((row) => ({ ...row, hasMedia: Boolean(row.hasMedia), content: JSON.parse(row.content) }));
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
