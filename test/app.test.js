import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
const quietLogger = { info() {}, error() {} };

async function withServer(whatsapp, run) {
  const queue = { size: 0, add: (task) => task() };
  const sessions = {
    list: () => [{ id: 'default', ...whatsapp.status(), queue: 0 }],
    get: async (id) => id === 'default' ? { whatsapp, queue } : null
  };
  const app = createApp({
    sessions,
    config: { bodyLimit: '2kb', allowedFilePaths: ['/tmp/allowed'], maxPdfBytes: 1024 },
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

test('send-text validates input and returns a message id', async () => {
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
    assert.deepEqual(await success.json(), { success: true, session: 'default', messageId: 'message-123' });

    const invalid = await fetch(`${base}/send-text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '../bad', message: '' })
    });
    assert.equal(invalid.status, 422);
  });
});

test('named session routes reject invalid and unknown identifiers', async () => {
  await withServer({ status: () => ({}), qr: () => ({}) }, async (base) => {
    assert.equal((await fetch(`${base}/sessions/UPPER/status`)).status, 422);
    assert.equal((await fetch(`${base}/sessions/unknown/status`)).status, 404);
  });
});
