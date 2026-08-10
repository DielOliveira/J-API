import express from 'express';
import { sanitizeFilename, validatePdfFile } from './files.js';
import { validateSessionId } from './sessions.js';

const PHONE_PATTERN = /^[1-9]\d{9,14}$/;

function validatePhone(phone) {
  if (typeof phone !== 'string' || !PHONE_PATTERN.test(phone)) {
    throw new Error('phone must contain 10 to 15 digits, including country code');
  }
  return phone;
}

function validateMessage(value, name = 'message', { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || value.trim() === '' || value.length > 4096) {
    throw new Error(`${name} must be a non-empty string up to 4096 characters`);
  }
  return value;
}

function sessionId(request) {
  return validateSessionId(request.params.session ?? 'default');
}

async function existingSession(sessions, id) {
  const entry = await sessions.get(id);
  if (!entry) throw new Error('session not found; request its QR first');
  return entry;
}

export function createApp({ sessions, config, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: config.bodyLimit, strict: true }));

  app.get('/sessions', (_request, response) => response.json({ sessions: sessions.list() }));

  const statusHandler = async (request, response, next) => {
    try {
      const id = sessionId(request);
      const entry = await existingSession(sessions, id);
      response.json({ session: id, ...entry.whatsapp.status(), queue: entry.queue.size });
    } catch (error) { next(error); }
  };

  const qrHandler = async (request, response, next) => {
    try {
      const id = sessionId(request);
      const entry = await sessions.get(id, { create: true });
      const result = entry.whatsapp.qr();
      response.status(result.required && !result.dataUrl ? 202 : 200).json({ session: id, ...result });
    } catch (error) { next(error); }
  };

  const sendTextHandler = async (request, response, next) => {
    try {
      const id = sessionId(request);
      const { whatsapp, queue } = await existingSession(sessions, id);
      const phone = validatePhone(request.body?.phone);
      const message = validateMessage(request.body?.message);
      logger.info(`[message] session=${id} queued type=text queue=${queue.size + 1}`);
      const messageId = await queue.add(() => whatsapp.sendText(phone, message));
      logger.info(`[message] session=${id} sent id=${messageId}`);
      response.json({ success: true, session: id, messageId });
    } catch (error) { next(error); }
  };

  const sendFileHandler = async (request, response, next) => {
    try {
      const id = sessionId(request);
      const { whatsapp, queue } = await existingSession(sessions, id);
      const phone = validatePhone(request.body?.phone);
      const filename = sanitizeFilename(request.body?.filename);
      const caption = validateMessage(request.body?.caption, 'caption', { optional: true });
      const pdf = await validatePdfFile(request.body?.path, config.allowedFilePaths, config.maxPdfBytes);
      logger.info(`[message] session=${id} queued type=pdf queue=${queue.size + 1}`);
      const messageId = await queue.add(() => whatsapp.sendPdf(phone, pdf, filename, caption));
      logger.info(`[message] session=${id} sent id=${messageId}`);
      response.json({ success: true, session: id, messageId });
    } catch (error) { next(error); }
  };

  app.get('/status', statusHandler);
  app.get('/qr', qrHandler);
  app.post('/send-text', sendTextHandler);
  app.post('/send-file', sendFileHandler);

  app.get('/sessions/:session/status', statusHandler);
  app.get('/sessions/:session/qr', qrHandler);
  app.post('/sessions/:session/send-text', sendTextHandler);
  app.post('/sessions/:session/send-file', sendFileHandler);

  app.use((error, _request, response, _next) => {
    const bodyError = error.type === 'entity.too.large' || error instanceof SyntaxError;
    const unavailable = error.message === 'WhatsApp is not connected' || error.message.includes('shutting down');
    const notFound = error.message.startsWith('session not found');
    const conflict = error.message.startsWith('maximum of');
    const status = bodyError ? 400 : notFound ? 404 : conflict ? 409 : unavailable ? 503 : 422;
    logger.error(`[request] failed: ${error.message}`);
    response.status(status).json({ success: false, error: bodyError ? 'invalid request body' : error.message });
  });
  return app;
}
