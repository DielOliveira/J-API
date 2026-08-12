import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
const quietLogger = { info() {}, error() {} };

async function withServer(whatsapp, run) {
  let sequence = 0;
  const jobs = new Map();
  const queue = {
    size: 0,
    add: ({ type }) => {
      const job = { id: `job-${++sequence}`, status: 'pending', type };
      jobs.set(job.id, job);
      return { job, duplicate: false };
    },
    get: (id) => jobs.get(id) ?? null,
    list: () => [...jobs.values()]
  };
  const sessions = {
    list: () => [{ id: 'default', ...whatsapp.status(), queue: 0 }],
    get: async (id) => id === 'default' ? { whatsapp, queue } : null
  };
  const app = createApp({
    sessions,
    config: {
      bodyLimit: '2kb', allowedFilePaths: ['/tmp/allowed'], allowedDownloadHosts: ['example.com'],
      maxPdfBytes: 1024, queueFilesPath: '/tmp/j-api-test-queue-files'
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
    assert.match(response.headers.get('content-security-policy'), /img-src data:/);
    assert.match(html, /Fila de envios/);
    assert.match(html, /Conectar WhatsApp/);
    assert.match(html, /Nome da sessão/);
    assert.match(html, /Gerar QR Code/);
    assert.match(html, /Sessões do WhatsApp/);
    assert.match(html, /renderSessions/);
    assert.match(html, /pattern="\[a-z0-9\]\[a-z0-9_-\]\{0,31\}"/);
    assert.match(html, /\/sessions\/.*\/qr/);
    assert.match(html, /#qr-image\[hidden\] \{ display:none; \}/);
    assert.doesNotMatch(html, /payload|merchantName|pdfPath/);
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
