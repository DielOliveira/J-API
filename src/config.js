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

  const sessionPath = path.resolve(process.env.SESSION_PATH ?? './data/session');
  if (sessionPath === path.parse(sessionPath).root) throw new Error('SESSION_PATH cannot be a filesystem root');

  return Object.freeze({
    host,
    port: positiveInteger('PORT', 3001, { max: 65535 }),
    sessionPath,
    maxSessions: positiveInteger('MAX_SESSIONS', 10, { max: 100 }),
    allowedFilePaths,
    maxPdfBytes: positiveInteger('MAX_PDF_SIZE_MB', 20) * 1024 * 1024,
    sendDelayMs: positiveInteger('SEND_DELAY_MS', 1000, { allowZero: true }),
    bodyLimit: process.env.HTTP_BODY_LIMIT ?? '32kb'
  });
}
