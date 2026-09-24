import { getContentType, normalizeMessageContent } from '@whiskeysockets/baileys';
import { phoneCandidates } from './phone.js';

function jidPhone(jid) {
  if (typeof jid !== 'string' || !jid.endsWith('@s.whatsapp.net')) return null;
  const phone = jid.split('@')[0]?.split(':')[0];
  return /^\d+$/.test(phone ?? '') ? phone : null;
}

function numberValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}

function messageText(type, value) {
  if (type === 'conversation') return typeof value === 'string' ? value : null;
  if (!value || typeof value !== 'object') return null;
  return value.text ?? value.caption ?? value.selectedDisplayText ?? value.title ?? null;
}

function publicContent(type, value) {
  if (type === 'conversation') return { text: value };
  if (!value || typeof value !== 'object') return {};
  const content = {};
  for (const key of ['text', 'caption', 'mimetype', 'fileName', 'fileLength', 'seconds', 'ptt', 'displayName', 'vcard']) {
    if (value[key] !== undefined && value[key] !== null) content[key] = value[key];
  }
  if (value.degreesLatitude !== undefined) content.latitude = value.degreesLatitude;
  if (value.degreesLongitude !== undefined) content.longitude = value.degreesLongitude;
  return content;
}

async function messagePhone(socket, key) {
  for (const jid of [key.remoteJidAlt, key.remoteJid]) {
    const phone = jidPhone(jid);
    if (phone) return phone;
  }
  const lid = [key.remoteJid, key.remoteJidAlt].find((jid) => jid?.endsWith('@lid'));
  if (!lid) return null;
  return jidPhone(await socket.signalRepository?.lidMapping?.getPNForLID(lid));
}

export async function monitoredMessage(socket, message, monitor, session, now = Date.now()) {
  if (!message?.key?.id || !message.message || message.key.remoteJid?.endsWith('@g.us')) return null;
  const phone = await messagePhone(socket, message.key);
  if (!phone || !phoneCandidates(monitor.phone).includes(phone)) return null;
  const content = normalizeMessageContent(message.message);
  const type = getContentType(content) ?? 'unknown';
  const value = content?.[type];
  const timestamp = numberValue(message.messageTimestamp);
  return {
    session,
    messageId: message.key.id,
    phone: monitor.phone,
    direction: message.key.fromMe ? 'sent' : 'received',
    messageType: type,
    text: messageText(type, value),
    content: publicContent(type, value),
    messageAt: Number.isFinite(timestamp) && timestamp > 0 ? timestamp * 1000 : now,
    storedAt: now
  };
}
