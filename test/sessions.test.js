import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSessionId } from '../src/sessions.js';

test('session identifiers cannot contain traversal or ambiguous characters', () => {
  assert.equal(validateSessionId('financeiro-01'), 'financeiro-01');
  assert.throws(() => validateSessionId('../session'), /session must/);
  assert.throws(() => validateSessionId('Financeiro'), /session must/);
  assert.throws(() => validateSessionId('a'.repeat(33)), /session must/);
});
