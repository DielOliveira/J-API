import express from 'express';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { queueAdminPage } from './admin.js';
import { downloadPdf, sanitizeFilename, stagePdf, validateDownloadUrl, validatePdfFile } from './files.js';
import { validateSessionId } from './sessions.js';

const PHONE_PATTERN = /^[1-9]\d{9,14}$/;
const PIX_KEY_TYPES = new Set(['EVP', 'EMAIL', 'PHONE', 'CPF']);

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

function validatePix(value) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 1024 || /[\r\n]/.test(value)) {
    throw new Error('pix must be a single non-empty line up to 1024 characters');
  }
  return value;
}

function validateMerchantName(value) {
  if (value === undefined || value === null || value === '') return 'Pix';
  if (typeof value !== 'string' || value.trim() === '' || value.length > 100 || /[\r\n]/.test(value)) {
    throw new Error('merchantName must be a single non-empty line up to 100 characters');
  }
  return value;
}

function validatePixKeyType(value) {
  if (value === undefined || value === null || value === '') return 'EVP';
  if (typeof value !== 'string' || !PIX_KEY_TYPES.has(value)) {
    throw new Error('keyType must be one of EVP, EMAIL, PHONE or CPF');
  }
  return value;
}

function sessionId(request) {
  return validateSessionId(request.params.session ?? 'default');
}

function idempotencyKey(request) {
  const value = request.get('idempotency-key');
  if (value === undefined) return null;
  if (value.length < 1 || value.length > 200 || /[^\x21-\x7e]/.test(value)) {
    throw new Error('Idempotency-Key must contain 1 to 200 visible ASCII characters');
  }
  return value;
}

function accepted(response, id, result) {
  response.status(result.duplicate ? 200 : 202).json({
    success: true,
    session: id,
    queued: result.job.status === 'pending' || result.job.status === 'processing',
    duplicate: result.duplicate,
    jobId: result.job.id,
    status: result.job.status,
    ...(result.job.whatsappMessageId ? { messageId: result.job.whatsappMessageId } : {})
  });
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

  app.get('/admin/queue', (_request, response) => {
    const nonce = randomBytes(16).toString('base64');
    response.set({
      'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    response.type('html').send(queueAdminPage(nonce));
  });

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

  const logoutHandler = async (request, response, next) => {
    try {
      const id = sessionId(request);
      const { whatsapp } = await existingSession(sessions, id);
      await whatsapp.logout();
      response.json({ success: true, session: id, connected: false });
    } catch (error) { next(error); }
  };

  const sendTextHandler = async (request, response, next) => {
    try {
      const id = sessionId(request);
      const { whatsapp, queue } = await existingSession(sessions, id);
      const phone = validatePhone(request.body?.phone);
      const message = validateMessage(request.body?.message);
      const result = queue.add({ type: 'text', phone, payload: { message }, idempotencyKey: idempotencyKey(request) });
      logger.info(`[message] session=${id} accepted type=text job=${result.job.id} queue=${queue.size}`);
      accepted(response, id, result);
    } catch (error) { next(error); }
  };

  const sendFileHandler = async (request, response, next) => {
    try {
      const id = sessionId(request);
      const { whatsapp, queue } = await existingSession(sessions, id);
      const phone = validatePhone(request.body?.phone);
      const filename = sanitizeFilename(request.body?.filename);
      const caption = validateMessage(request.body?.caption, 'caption', { optional: true });
      const hasPath = typeof request.body?.path === 'string' && request.body.path !== '';
      const hasUrl = typeof request.body?.url === 'string' && request.body.url !== '';
      if (hasPath === hasUrl) throw new Error('provide exactly one of path or url');
      const source = hasPath
        ? await validatePdfFile(request.body.path, config.allowedFilePaths, config.maxPdfBytes)
        : await downloadPdf(
          validateDownloadUrl(request.body.url, config.allowedDownloadHosts).href,
          config.allowedDownloadHosts,
          config.maxPdfBytes
        );
      const pdfPath = await stagePdf(source, config.queueFilesPath);
      try {
        const result = queue.add({
          type: 'pdf', phone, payload: { pdfPath, filename, caption }, idempotencyKey: idempotencyKey(request)
        });
        if (result.duplicate) await fs.unlink(pdfPath).catch(() => {});
        logger.info(`[message] session=${id} accepted type=pdf job=${result.job.id} queue=${queue.size}`);
        accepted(response, id, result);
      } catch (error) {
        await fs.unlink(pdfPath).catch(() => {});
        throw error;
      }
    } catch (error) { next(error); }
  };

  const sendPixHandler = async (request, response, next) => {
    try {
      const id = sessionId(request);
      const { whatsapp, queue } = await existingSession(sessions, id);
      const phone = validatePhone(request.body?.phone);
      const message = validateMessage(request.body?.message);
      const pix = validatePix(request.body?.pix);
      const merchantName = validateMerchantName(request.body?.merchantName);
      const keyType = validatePixKeyType(request.body?.keyType);
      const result = queue.add({
        type: 'pix', phone, payload: { message, pix, merchantName, keyType }, idempotencyKey: idempotencyKey(request)
      });
      logger.info(`[message] session=${id} accepted type=pix job=${result.job.id} queue=${queue.size}`);
      accepted(response, id, result);
    } catch (error) { next(error); }
  };

  app.get('/status', statusHandler);
  app.get('/qr', qrHandler);
  app.post('/logout', logoutHandler);
  app.post('/send-text', sendTextHandler);
  app.post('/send-pix', sendPixHandler);
  app.post('/send-file', sendFileHandler);

  app.get('/sessions/:session/status', statusHandler);
  app.get('/sessions/:session/qr', qrHandler);
  app.post('/sessions/:session/logout', logoutHandler);
  app.post('/sessions/:session/send-text', sendTextHandler);
  app.post('/sessions/:session/send-pix', sendPixHandler);
  app.post('/sessions/:session/send-file', sendFileHandler);

  app.get('/sessions/:session/queue', async (request, response, next) => {
    try {
      const id = sessionId(request);
      const { queue } = await existingSession(sessions, id);
      const rawLimit = request.query.limit ?? '100';
      if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 500) throw new Error('limit must be between 1 and 500');
      response.json({ session: id, queue: queue.list(Number(rawLimit)) });
    } catch (error) { next(error); }
  });

  app.get('/sessions/:session/queue/:jobId', async (request, response, next) => {
    try {
      const id = sessionId(request);
      const { queue } = await existingSession(sessions, id);
      const job = queue.get(request.params.jobId);
      if (!job) return response.status(404).json({ success: false, error: 'queue job not found' });
      response.json({ session: id, job });
    } catch (error) { next(error); }
  });

  app.get('/queue', async (request, response, next) => {
    try {
      const { queue } = await existingSession(sessions, 'default');
      const rawLimit = request.query.limit ?? '100';
      if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 500) throw new Error('limit must be between 1 and 500');
      response.json({ session: 'default', queue: queue.list(Number(rawLimit)) });
    } catch (error) { next(error); }
  });

  app.get('/queue/:jobId', async (request, response, next) => {
    try {
      const { queue } = await existingSession(sessions, 'default');
      const job = queue.get(request.params.jobId);
      if (!job) return response.status(404).json({ success: false, error: 'queue job not found' });
      response.json({ session: 'default', job });
    } catch (error) { next(error); }
  });

  app.use((error, _request, response, _next) => {
    const bodyError = error.type === 'entity.too.large' || error instanceof SyntaxError;
    const unavailable = error.message === 'WhatsApp is not connected' || error.message.includes('shutting down');
    const notFound = error.message.startsWith('session not found');
    const conflict = error.message.startsWith('maximum of') || error.message === 'send queue is full';
    const status = bodyError ? 400 : notFound ? 404 : conflict ? 409 : unavailable ? 503 : 422;
    logger.error(`[request] failed: ${error.message}`);
    response.status(status).json({ success: false, error: bodyError ? 'invalid request body' : error.message });
  });
  return app;
}
