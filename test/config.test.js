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

test('zero disables hourly and daily volume limits', { concurrency: false }, () => {
  const previous = { ...process.env };
  try {
    process.env.HOST = '127.0.0.1';
    process.env.ALLOWED_FILE_PATHS = '/tmp/files';
    process.env.MAX_SENDS_PER_HOUR = '0';
    process.env.MAX_CONTACTS_PER_HOUR = '0';
    process.env.MAX_SENDS_PER_DAY = '0';

    const config = loadConfig();
    assert.equal(config.queueLimits.maxSendsPerHour, 0);
    assert.equal(config.queueLimits.maxContactsPerHour, 0);
    assert.equal(config.queueLimits.maxSendsPerDay, 0);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});
