import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  generateWAMessageFromContent,
  proto,
  fetchLatestWaWebVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';

const silentBaileysLogger = pino({ level: 'silent' });

export function phoneCandidates(phone) {
  const candidates = [phone];

  if (phone.startsWith('55') && phone.length === 13 && phone[4] === '9') {
    candidates.push(`${phone.slice(0, 4)}${phone.slice(5)}`);
  } else if (phone.startsWith('55') && phone.length === 12) {
    candidates.push(`${phone.slice(0, 4)}9${phone.slice(4)}`);
  }

  return candidates;
}
let waVersionPromise;

function pixRelayNodes() {
  const privacyModeTimestamp = Math.floor(Date.now() / 1000) - 77_980_457;
  return [
    { tag: 'bot', attrs: { biz_bot: '1' } },
    {
      tag: 'biz',
      attrs: {
        actual_actors: '2',
        host_storage: '2',
        privacy_mode_ts: String(privacyModeTimestamp),
        native_flow_name: 'payment_info'
      }
    }
  ];
}

async function currentWaVersion(logger) {
  waVersionPromise ??= fetchLatestWaWebVersion({}).catch((error) => {
    waVersionPromise = undefined;
    logger.warn(`[whatsapp] could not fetch current WA Web version: ${error.message}`);
    return null;
  });
  return waVersionPromise;
}

export class WhatsAppClient {
  #socket = null;
  #stopping = false;
  #reconnectTimer = null;
  #attempt = 0;
  #qrGeneration = 0;
  #status = { connected: false, state: 'starting', phone: null, qrDataUrl: null };

  constructor({ sessionPath, logger = console, logPrefix = '' }) {
    this.sessionPath = sessionPath;
    this.logger = logger;
    this.logPrefix = logPrefix ? ` ${logPrefix}` : '';
  }

  status() {
    return { connected: this.#status.connected, state: this.#status.state, phone: this.#status.phone };
  }

  qr() {
    if (this.#status.connected) return { required: false, state: this.#status.state };
    return { required: true, state: this.#status.state, dataUrl: this.#status.qrDataUrl };
  }

  async start() {
    this.#stopping = false;
    await fs.mkdir(this.sessionPath, { recursive: true, mode: 0o700 });
    await this.#connect();
  }

  async #connect() {
    if (this.#stopping) return;
    this.#status = { ...this.#status, connected: false, state: 'connecting', qrDataUrl: null };
    this.logger.info(`[whatsapp]${this.logPrefix} connecting`);
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
    const versionInfo = await currentWaVersion(this.logger);
    const socket = makeWASocket({
      auth: state,
      ...(versionInfo?.version ? { version: versionInfo.version } : {}),
      browser: Browsers.ubuntu('Local WhatsApp Service'),
      logger: silentBaileysLogger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false
    });
    this.#socket = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => void this.#onConnectionUpdate(socket, update));
  }

  async #onConnectionUpdate(socket, { connection, lastDisconnect, qr }) {
    if (socket !== this.#socket || this.#stopping) return;
    if (qr) {
      const generation = ++this.#qrGeneration;
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
        if (generation === this.#qrGeneration && socket === this.#socket) {
          this.#status = { ...this.#status, state: 'awaiting_qr', qrDataUrl: dataUrl };
          this.logger.info(`[whatsapp]${this.logPrefix} qr generated`);
        }
      } catch (error) {
        this.logger.error(`[whatsapp]${this.logPrefix} QR encoding failed: ${error.message}`);
      }
    }
    if (connection === 'open') {
      this.#attempt = 0;
      this.#status = {
        connected: true,
        state: 'ready',
        phone: socket.user?.id?.split(':')[0]?.split('@')[0] ?? null,
        qrDataUrl: null
      };
      this.logger.info(`[whatsapp]${this.logPrefix} authenticated`);
      this.logger.info(`[whatsapp]${this.logPrefix} ready`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.statusCode;
      this.#status = { ...this.#status, connected: false, state: 'disconnected', qrDataUrl: null };
      this.logger.warn(`[whatsapp]${this.logPrefix} disconnected: code=${code ?? 'unknown'}`);
      socket.end(undefined);
      if (code === DisconnectReason.loggedOut) {
        await this.#archiveInvalidSession();
        this.#status = { connected: false, state: 'logged_out', phone: null, qrDataUrl: null };
        this.#scheduleReconnect(1000);
      } else {
        this.#scheduleReconnect();
      }
    }
  }

  async #archiveInvalidSession() {
    const backup = `${this.sessionPath}.invalid-${Date.now()}`;
    try {
      await fs.rename(this.sessionPath, backup);
      await fs.mkdir(this.sessionPath, { recursive: true, mode: 0o700 });
      this.logger.warn(`[whatsapp]${this.logPrefix} logged-out session archived at ${path.basename(backup)}`);
    } catch (error) {
      this.logger.error(`[whatsapp]${this.logPrefix} could not archive invalid session: ${error.message}`);
    }
  }

  #scheduleReconnect(delay) {
    if (this.#stopping || this.#reconnectTimer) return;
    const wait = delay ?? Math.min(30_000, 1000 * (2 ** Math.min(this.#attempt++, 5)));
    this.#status = { ...this.#status, state: 'reconnecting' };
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect().catch((error) => {
        this.logger.error(`[whatsapp]${this.logPrefix} reconnect failed: ${error.message}`);
        this.#scheduleReconnect();
      });
    }, wait);
  }

  #readySocket() {
    if (!this.#status.connected || !this.#socket) throw new Error('WhatsApp is not connected');
    return this.#socket;
  }

  async logout() {
    const socket = this.#readySocket();
    this.logger.info(`[whatsapp]${this.logPrefix} logout requested`);
    await socket.logout();
  }

  async #recipientJid(phone) {
    const socket = this.#readySocket();
    const candidates = phoneCandidates(phone).map((candidate) => `${candidate}@s.whatsapp.net`);
    const results = await socket.onWhatsApp(...candidates);
    const recipient = results.find((result) => result.exists);

    if (!recipient?.jid) throw new Error('Phone is not registered on WhatsApp');

    return recipient.jid;
  }

  async sendText(phone, message) {
    const socket = this.#readySocket();
    const result = await socket.sendMessage(await this.#recipientJid(phone), { text: message });
    return result.key.id;
  }

  async sendPix(phone, message, pix, merchantName, keyType) {
    const socket = this.#readySocket();
    const jid = await this.#recipientJid(phone);
    const content = generateWAMessageFromContent(jid, {
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: { text: message },
        nativeFlowMessage: {
          buttons: [{
            name: 'payment_info',
            buttonParamsJson: JSON.stringify({
              payment_settings: [{
                type: 'pix_static_code',
                pix_static_code: {
                  merchant_name: merchantName,
                  key: pix,
                  key_type: keyType
                }
              }]
            })
          }],
          messageParamsJson: '{}',
          messageVersion: 1
        }
      })
    }, { userJid: socket.user?.id });
    await socket.relayMessage(jid, content.message, {
      messageId: content.key.id,
      additionalNodes: pixRelayNodes()
    });
    return content.key.id;
  }

  async sendPdf(phone, pdf, filename, caption) {
    const socket = this.#readySocket();
    const result = await socket.sendMessage(await this.#recipientJid(phone), {
      document: pdf.buffer ?? { url: pdf.realPath },
      mimetype: 'application/pdf',
      fileName: filename,
      ...(caption ? { caption } : {})
    });
    return result.key.id;
  }

  async stop() {
    this.#stopping = true;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#status = { ...this.#status, connected: false, state: 'stopped', qrDataUrl: null };
    if (this.#socket) {
      this.#socket.end(undefined);
      this.#socket = null;
    }
  }
}
