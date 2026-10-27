import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sendQueuedDocument } from '../src/sessions.js';
import { QueueStore } from '../src/queue-store.js';
import { PersistentSendQueue } from '../src/queue.js';
import { xlsxBuffer } from './fixtures/xlsx.js';

test('XLSX job survives reopening the queue and cleans staged file only after success', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-document-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'staged.xlsx');
  await fs.writeFile(filePath, xlsxBuffer());
  const payload = { filePath, filename: 'report.xlsx', caption: 'Simulação' };
  const database = path.join(root, 'queue.sqlite');
  const initial = new QueueStore(database);
  initial.enqueue({ id: 'xlsx-job', session: 'financeiro', type: 'xlsx', phone: '5562999999999', payload, createdAt: Date.now(), idempotencyKey: 'xlsx-stable' });
  initial.close();
  const store = new QueueStore(database);
  const calls = [];
  const whatsapp = { sendXlsx: async (...args) => { calls.push(args); return 'wa-xlsx'; } };
  // Transport failures preserve the staged file for retry.
  await assert.rejects(sendQueuedDocument(store.get('xlsx-job'), store.payload('xlsx-job'), { sendXlsx: async () => { throw new Error('offline'); } }), /offline/);
  assert.ok((await fs.stat(filePath)).isFile());
  const queue = new PersistentSendQueue({ store, session: 'financeiro', send: (job, data) => sendQueuedDocument(job, data, whatsapp), logger: { info() {} },
    limits: { delayMinMs: 0, delayMaxMs: 0, maxSendsPerHour: 0, maxContactsPerHour: 0, maxSendsPerDay: 0, maxQueueSize: 100, maxAttempts: 2, retryBaseMs: 5, retryMaxMs: 10, pollMs: 5 } });
  t.after(async () => { await queue.close(); store.close(); });
  queue.start();
  const until = Date.now() + 1000;
  while (store.get('xlsx-job').status !== 'sent' && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(store.get('xlsx-job').status, 'sent');
  assert.equal(store.get('xlsx-job').whatsappMessageId, 'wa-xlsx');
  assert.deepEqual(calls, [['5562999999999', { realPath: filePath }, 'report.xlsx', 'Simulação']]);
  await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
});
