import assert from 'node:assert/strict';
import test from 'node:test';
import { SendQueue } from '../src/queue.js';

test('queue serializes tasks and preserves order', async () => {
  const queue = new SendQueue(0);
  const events = [];
  const first = queue.add(async () => {
    events.push('first-start');
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push('first-end');
    return 'one';
  });
  const second = queue.add(async () => {
    events.push('second');
    return 'two';
  });
  assert.deepEqual(await Promise.all([first, second]), ['one', 'two']);
  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

test('closed queue rejects new work', async () => {
  const queue = new SendQueue(0);
  queue.close();
  await assert.rejects(queue.add(async () => true), /shutting down/);
});
