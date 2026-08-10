import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

test('configuration refuses remote bind and relative allowed roots', { concurrency: false }, () => {
  const previous = { ...process.env };
  try {
    process.env.HOST = '0.0.0.0';
    process.env.ALLOWED_FILE_PATHS = '/tmp/files';
    assert.throws(loadConfig, /127\.0\.0\.1/);

    process.env.HOST = '127.0.0.1';
    process.env.ALLOWED_FILE_PATHS = 'relative/files';
    assert.throws(loadConfig, /absolute/);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});
