import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sanitizeFilename, validatePdfFile } from '../src/files.js';

test('filename is reduced to a safe PDF basename', () => {
  assert.equal(sanitizeFilename('../../fatura ç.pdf'), 'fatura _.pdf');
  assert.throws(() => sanitizeFilename('payload.exe'), /\.pdf/);
});

test('PDF validation accepts content inside an allowed root', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-files-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pdf = path.join(root, 'document.pdf');
  await fs.writeFile(pdf, Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'));
  const result = await validatePdfFile(pdf, [root], 1024);
  assert.equal(result.realPath, pdf);
});

test('PDF validation blocks paths outside allowed roots', async (t) => {
  const allowed = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-allowed-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-outside-'));
  t.after(() => Promise.all([
    fs.rm(allowed, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true })
  ]));
  const pdf = path.join(outside, 'document.pdf');
  await fs.writeFile(pdf, Buffer.from('%PDF-1.4\n%%EOF\n'));
  await assert.rejects(validatePdfFile(pdf, [allowed], 1024), /outside/);
});
