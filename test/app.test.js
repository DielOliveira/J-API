import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
const quietLogger = { info() {}, error() {} };

async function withServer(whatsapp, run, { initialBlocked = [] } = {}) {
  let sequence = 0;
  const jobs = new Map();
  const blockedRecipients = new Map(initialBlocked.map((recipient) => [recipient.phone, recipient]));
  const monitors = new Map();
  const monitoredMessages = [];
  const queue = {
    size: 0,
    blockedRecipient: (phone) => blockedRecipients.get(phone) ?? null,
    add: ({ type, phone }) => {
      const blockedRecipient = blockedRecipients.get(phone);
      if (blockedRecipient) return { blocked: true, blockedRecipient, duplicate: false };
      const job = { id: `job-${++sequence}`, status: 'pending', type };
      jobs.set(job.id, job);
      return { job, duplicate: false };
    },
    get: (id) => jobs.get(id) ?? null,
    list: () => [...jobs.values()],
    listBetween: (start, end) => [...jobs.values()].filter((job) => job.createdAt >= start && job.createdAt < end)
  };
  const sessions = {
    list: () => [{ id: 'default', ...whatsapp.status(), queue: 0 }],
    get: async (id) => id === 'default' ? { whatsapp, queue } : null
  };
  const store = {
    listBlockedRecipients: () => [...blockedRecipients.values()],
    unblockRecipient: (phone) => blockedRecipients.delete(phone),
    setMessageMonitor: (session, phone) => {
      const monitor = { session, phone, createdAt: 1, updatedAt: 1 };
      monitors.set(session, monitor);
      return monitor;
    },
    getMessageMonitor: (session) => monitors.get(session) ?? null,
    removeMessageMonitor: (session) => monitors.delete(session),
    listMonitoredMessages: (session, phone, limit, before) => monitoredMessages
      .filter((message) => message.session === session && message.phone === phone && message.messageAt < before)
      .slice(0, limit),
    monitoredMessageMedia: () => null
  };
  const app = createApp({
    sessions,
    store,
    config: {
      bodyLimit: '2kb', allowedFilePaths: ['/tmp/allowed'], allowedDownloadHosts: ['example.com'],
      maxPdfBytes: 1024, queueFilesPath: '/tmp/j-api-test-queue-files', messageMediaPath: '/tmp/j-api-test-message-media'
    },
    logger: quietLogger
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('status and QR endpoints expose only public state', async () => {
  await withServer({
    status: () => ({ connected: false, state: 'awaiting_qr', phone: null }),
    qr: () => ({ required: true, state: 'awaiting_qr', dataUrl: 'data:image/png;base64,abc' })
  }, async (base) => {
    assert.deepEqual(await (await fetch(`${base}/status`)).json(), {
      session: 'default', connected: false, state: 'awaiting_qr', phone: null, queue: 0
    });
    assert.equal((await (await fetch(`${base}/qr`)).json()).required, true);
  });
});

test('queue admin panel is served with restrictive browser security headers', async () => {
  await withServer({ status: () => ({}), qr: () => ({}) }, async (base) => {
    const response = await fetch(`${base}/admin/queue`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /img-src 'self' data:/);
    assert.match(html, /Fila de envios/);
    assert.match(html, /Conectar WhatsApp/);
    assert.match(html, /Nome da sessão/);
    assert.match(html, /Gerar QR Code/);
    assert.match(html, /Sessões do WhatsApp/);
    assert.match(html, /id="date-filter" type="date"/);
    assert.match(html, /localDateValue/);
    assert.match(html, /renderSessions/);
    assert.match(html, /Desconectar/);
    assert.match(html, /Destinatários bloqueados/);
    assert.match(html, /Monitor de conversa/);
    assert.match(html, /id="monitor-session"/);
    assert.match(html, /id="monitor-phone"/);
    assert.match(html, /\/message-monitor/);
    assert.match(html, /\/messages\?limit=100/);
    assert.match(html, /Ativar monitoramento/);
    assert.match(html, /Desbloquear/);
    assert.match(html, /\/blocked-recipients/);
    assert.match(html, /\/logout/);
    assert.match(html, /pattern="\[a-z0-9\]\[a-z0-9_-\]\{0,31\}"/);
    assert.match(html, /\/sessions\/.*\/qr/);
    assert.match(html, /#qr-image\[hidden\] \{ display:none; \}/);
    assert.doesNotMatch(html, /payload|merchantName|pdfPath/);
  });
});

test('blocked recipients are suppressed transparently and can be unblocked', async () => {
  const recipient = { phone: '5562999999999', reason: 'Phone is not registered on WhatsApp', blockedAt: 1234 };
  await withServer({ status: () => ({}), qr: () => ({}) }, async (base) => {
    const suppressed = await fetch(`${base}/send-text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: recipient.phone, message: 'Olá' })
    });
    assert.equal(suppressed.status, 200);
    assert.deepEqual(await suppressed.json(), {
      success: true, session: 'default', queued: false, duplicate: false, blocked: true, status: 'blocked'
    });

    assert.deepEqual(await (await fetch(`${base}/blocked-recipients`)).json(), { blockedRecipients: [recipient] });
    assert.equal((await fetch(`${base}/blocked-recipients/${recipient.phone}`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(await (await fetch(`${base}/blocked-recipients`)).json(), { blockedRecipients: [] });

    const accepted = await fetch(`${base}/send-text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: recipient.phone, message: 'Olá novamente' })
    });
    assert.equal(accepted.status, 202);
  }, { initialBlocked: [recipient] });
});

test('queue endpoint accepts a bounded date range', async () => {
  await withServer({ status: () => ({}), qr: () => ({}) }, async (base) => {
    const response = await fetch(`${base}/queue?start=1000&end=2000`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { session: 'default', queue: [] });
    assert.equal((await fetch(`${base}/queue?start=1000`)).status, 422);
    assert.equal((await fetch(`${base}/queue?start=1000&end=${1000 + 32 * 86_400_000}`)).status, 422);
  });
});

test('logout endpoint disconnects only the requested session', async () => {
  let calls = 0;
  await withServer({
    status: () => ({ connected: true, state: 'ready', phone: null }),
    qr: () => ({ required: false, state: 'ready' }),
    logout: async () => { calls += 1; }
  }, async (base) => {
    const response = await fetch(`${base}/sessions/default/logout`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, session: 'default', connected: false });
    assert.equal(calls, 1);
  });
});

test('send-text validates input and accepts a persistent job', async () => {
  await withServer({
    status: () => ({}),
    qr: () => ({}),
    sendText: async () => 'message-123'
  }, async (base) => {
    const success = await fetch(`${base}/send-text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '5562999999999', message: 'Olá' })
    });
    assert.equal(success.status, 202);
    assert.deepEqual(await success.json(), {
      success: true, session: 'default', queued: true, duplicate: false, jobId: 'job-1', status: 'pending'
    });

    const invalid = await fetch(`${base}/send-text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '../bad', message: '' })
    });
    assert.equal(invalid.status, 422);
  });
});

test('send-pix validates input and accepts jobs', async () => {
  await withServer({
    status: () => ({}),
    qr: () => ({}),
    sendPix: async () => 'pix-123'
  }, async (base) => {
    const success = await fetch(`${base}/send-pix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '5562999999999',
        message: 'Pague usando o PIX:',
        pix: '00020101021226820014br.gov.bcb.pix',
        merchantName: 'Empresa Exemplo',
        keyType: 'EVP'
      })
    });
    assert.equal(success.status, 202);
    assert.equal((await success.json()).status, 'pending');

    for (const pix of ['', 'linha 1\nlinha 2', 'x'.repeat(1025)]) {
      const invalid = await fetch(`${base}/send-pix`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '5562999999999', message: 'PIX', pix })
      });
      assert.equal(invalid.status, 422);
    }

    const defaults = await fetch(`${base}/send-pix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '5562999999999', message: 'PIX', pix: 'chave' })
    });
    assert.equal(defaults.status, 202);

    const invalidType = await fetch(`${base}/send-pix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '5562999999999', message: 'PIX', pix: 'chave', keyType: 'CNPJ' })
    });
    assert.equal(invalidType.status, 422);
  });
});

test('named session routes reject invalid and unknown identifiers', async () => {
  await withServer({ status: () => ({}), qr: () => ({}) }, async (base) => {
    assert.equal((await fetch(`${base}/sessions/UPPER/status`)).status, 422);
    assert.equal((await fetch(`${base}/sessions/unknown/status`)).status, 404);
  });
});

test('message monitor can be configured, queried and disabled per session', async () => {
  await withServer({ status: () => ({}), qr: () => ({}) }, async (base) => {
    const enabled = await fetch(`${base}/sessions/default/message-monitor`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '5562999999999' })
    });
    assert.equal(enabled.status, 200);
    assert.equal((await enabled.json()).monitor.phone, '5562999999999');

    const status = await (await fetch(`${base}/sessions/default/message-monitor`)).json();
    assert.equal(status.monitor.phone, '5562999999999');
    assert.deepEqual(await (await fetch(`${base}/sessions/default/messages`)).json(), {
      session: 'default', phone: '5562999999999', messages: []
    });
    assert.equal((await fetch(`${base}/sessions/default/messages?limit=501`)).status, 422);

    const disabled = await fetch(`${base}/sessions/default/message-monitor`, { method: 'DELETE' });
    assert.equal((await disabled.json()).removed, true);
  });
});
