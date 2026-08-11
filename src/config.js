import 'dotenv/config';
import path from 'node:path';

function positiveInteger(name, fallback, { allowZero = false, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${name} is outside the allowed range`);
  }
  return value;
}

export function loadConfig() {
  const host = process.env.HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1') {
    throw new Error('HOST must be 127.0.0.1; remote binding is intentionally disabled');
  }

  const configuredFilePaths = (process.env.ALLOWED_FILE_PATHS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configuredFilePaths.length === 0) {
    throw new Error('ALLOWED_FILE_PATHS must contain at least one absolute directory');
  }
  if (configuredFilePaths.some((entry) => !path.isAbsolute(entry) || entry === path.parse(entry).root)) {
    throw new Error('ALLOWED_FILE_PATHS entries must be absolute directories and cannot be filesystem roots');
  }
  const allowedFilePaths = configuredFilePaths.map((entry) => path.resolve(entry));
  const allowedDownloadHosts = (process.env.ALLOWED_DOWNLOAD_HOSTS ?? 'public-api-pay.lytex.com.br')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowedDownloadHosts.length === 0 || allowedDownloadHosts.some((host) => !/^[a-z0-9.-]+$/.test(host))) {
    throw new Error('ALLOWED_DOWNLOAD_HOSTS must contain valid hostnames');
  }

  const sessionPath = path.resolve(process.env.SESSION_PATH ?? './data/session');
  if (sessionPath === path.parse(sessionPath).root) throw new Error('SESSION_PATH cannot be a filesystem root');
  const queueDatabasePath = path.resolve(process.env.QUEUE_DATABASE_PATH ?? './data/queue.sqlite');
  const queueFilesPath = path.resolve(process.env.QUEUE_FILES_PATH ?? './data/queue-files');
  if (queueDatabasePath === path.parse(queueDatabasePath).root || queueFilesPath === path.parse(queueFilesPath).root) {
    throw new Error('queue paths cannot be filesystem roots');
  }

  const delayMinMs = positiveInteger('SEND_DELAY_MIN_MS', 5000, { allowZero: true, max: 3_600_000 });
  const delayMaxMs = positiveInteger('SEND_DELAY_MAX_MS', 12000, { allowZero: true, max: 3_600_000 });
  if (delayMaxMs < delayMinMs) throw new Error('SEND_DELAY_MAX_MS must be greater than or equal to SEND_DELAY_MIN_MS');
  const retryBaseMs = positiveInteger('RETRY_BASE_MS', 30_000, { max: 86_400_000 });
  const retryMaxMs = positiveInteger('RETRY_MAX_MS', 1_800_000, { max: 86_400_000 });
  if (retryMaxMs < retryBaseMs) throw new Error('RETRY_MAX_MS must be greater than or equal to RETRY_BASE_MS');

  return Object.freeze({
    host,
    port: positiveInteger('PORT', 3001, { max: 65535 }),
    sessionPath,
    queueDatabasePath,
    queueFilesPath,
    maxSessions: positiveInteger('MAX_SESSIONS', 10, { max: 100 }),
    allowedFilePaths,
    allowedDownloadHosts,
    maxPdfBytes: positiveInteger('MAX_PDF_SIZE_MB', 20) * 1024 * 1024,
    queueLimits: Object.freeze({
      delayMinMs,
      delayMaxMs,
      maxSendsPerHour: positiveInteger('MAX_SENDS_PER_HOUR', 60, { allowZero: true, max: 10_000 }),
      maxContactsPerHour: positiveInteger('MAX_CONTACTS_PER_HOUR', 20, { allowZero: true, max: 10_000 }),
      maxSendsPerDay: positiveInteger('MAX_SENDS_PER_DAY', 150, { allowZero: true, max: 100_000 }),
      maxQueueSize: positiveInteger('MAX_QUEUE_SIZE', 1000, { max: 100_000 }),
      maxAttempts: positiveInteger('MAX_SEND_ATTEMPTS', 5, { max: 100 }),
      retryBaseMs,
      retryMaxMs,
      pollMs: positiveInteger('QUEUE_POLL_MS', 5000, { max: 60_000 })
    }),
    bodyLimit: process.env.HTTP_BODY_LIMIT ?? '32kb'
  });
}
