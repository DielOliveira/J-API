import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PersistentSendQueue } from '../src/queue.js';
import { QueueStore } from '../src/queue-store.js';

const limits = {
  delayMinMs: 0, delayMaxMs: 0, maxSendsPerHour: 100, maxContactsPerHour: 100,
  maxSendsPerDay: 100, maxQueueSize: 100, maxAttempts: 2,
  retryBaseMs: 5, retryMaxMs: 10, pollMs: 5
};
const logger = { info() {}, error() {}, warn() {} };

async function eventually(check, timeout = 1000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('condition was not reached');
}

test('persistent queue sends in order and survives store reads', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'j-api-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new QueueStore(path.join(root, 'queue.sqlite'));
  const calls = [];
  const queue = new PersistentSendQueue({
    store, session: 'default', limits, logger,
    send: async (job, payload) => { calls.push([job.phone, payload.message]); return `wa-${calls.length}`; }
  });
  const first = queue.add({ type: 'text', phone: '5511111111111', payload: { message: 'one' } });
  const second = queue.add({ type: 'text', phone: '5522222222222', payload: { message: 'two' } });
  queue.start();
  await eventually(() => queue.get(second.job.id)?.status === 'sent');
  assert.deepEqual(calls, [['5511111111111', 'one'], ['5522222222222', 'two']]);
  assert.equal(queue.get(first.job.id).whatsappMessageId, 'wa-1');
  await queue.close();
  store.close();
});

test('zero disables send and contact volume limits', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'j-api-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new QueueStore(path.join(root, 'queue.sqlite'));
  const unlimited = {
    ...limits, maxSendsPerHour: 0, maxContactsPerHour: 0, maxSendsPerDay: 0
  };
  const queue = new PersistentSendQueue({
    store, session: 'default', limits: unlimited, logger, send: async () => 'wa'
  });
  const first = queue.add({ type: 'text', phone: '5511111111111', payload: { message: 'one' } });
  const second = queue.add({ type: 'text', phone: '5522222222222', payload: { message: 'two' } });
  queue.start();
  await eventually(() => queue.get(second.job.id)?.status === 'sent');
  assert.equal(queue.get(first.job.id).status, 'sent');
  await queue.close();
  store.close();
});

test('idempotency key returns the original job', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'j-api-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new QueueStore(path.join(root, 'queue.sqlite'));
  const queue = new PersistentSendQueue({ store, session: 'default', limits, logger, send: async () => 'wa' });
  const first = queue.add({ type: 'text', phone: '5511111111111', payload: { message: 'one' }, idempotencyKey: 'billing-1' });
  const duplicate = queue.add({ type: 'text', phone: '5511111111111', payload: { message: 'one' }, idempotencyKey: 'billing-1' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.job.id, first.job.id);
  await queue.close();
  store.close();
});

test('temporary failures are retried without a new enqueue', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'j-api-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new QueueStore(path.join(root, 'queue.sqlite'));
  let attempts = 0;
  const queue = new PersistentSendQueue({
    store, session: 'default', limits, logger,
    send: async () => { if (++attempts === 1) throw new Error('temporary connection problem'); return 'wa-retried'; }
  });
  const result = queue.add({ type: 'text', phone: '5511111111111', payload: { message: 'one' } });
  queue.start();
  await eventually(() => queue.get(result.job.id)?.status === 'sent');
  assert.equal(attempts, 2);
  await queue.close();
  store.close();
});

test('processing jobs return to pending after reopening the store', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'j-api-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, 'queue.sqlite');
  let store = new QueueStore(databasePath);
  const queued = store.enqueue({
    id: 'restart-job', session: 'default', type: 'text', phone: '5511111111111',
    payload: { message: 'one' }, createdAt: Date.now()
  });
  assert.equal(store.claimNext('default').status, 'processing');
  store.close();
  store = new QueueStore(databasePath);
  assert.equal(store.get(queued.job.id).status, 'pending');
  store.close();
});
