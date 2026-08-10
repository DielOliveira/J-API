import assert from 'node:assert/strict';
import test from 'node:test';
import { phoneCandidates } from '../src/whatsapp.js';

test('Brazilian mobile numbers try current and legacy WhatsApp formats', () => {
  assert.deepEqual(phoneCandidates('5562984468028'), ['5562984468028', '556284468028']);
  assert.deepEqual(phoneCandidates('556284468028'), ['556284468028', '5562984468028']);
});

test('other phone formats are preserved', () => {
  assert.deepEqual(phoneCandidates('5511999999999'), ['5511999999999', '551199999999']);
  assert.deepEqual(phoneCandidates('12025550123'), ['12025550123']);
});
