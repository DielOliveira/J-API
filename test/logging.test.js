import assert from 'node:assert/strict';
import test from 'node:test';
import { installSensitiveLogFilter } from '../src/logging.js';

test('sensitive libsignal session dumps are suppressed', () => {
  const originalInfo = console.info;
  const seen = [];
  const debug = [];
  console.info = (...args) => seen.push(args);
  try {
    installSensitiveLogFilter({ debug: (message) => debug.push(message) });
    console.info('Closing session:', { secret: true });
    console.info('ordinary message');
    assert.deepEqual(seen, [['ordinary message']]);
    assert.deepEqual(debug, ['[whatsapp] cryptographic session rotated']);
  } finally {
    console.info = originalInfo;
  }
});
