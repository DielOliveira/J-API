import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sanitizeFilename, validateDownloadUrl, validatePdfFile, validateXlsxFile, stageDocument } from '../src/files.js';
import { xlsxBuffer, zipBuffer } from './fixtures/xlsx.js';

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

test('download URL validation requires HTTPS and an allowed host', () => {
  const hosts = ['public-api-pay.lytex.com.br'];
  assert.equal(
    validateDownloadUrl('https://public-api-pay.lytex.com.br/v1/invoices/print/id', hosts).hostname,
    hosts[0]
  );
  assert.throws(() => validateDownloadUrl('http://public-api-pay.lytex.com.br/file', hosts), /HTTPS/);
  assert.throws(() => validateDownloadUrl('https://127.0.0.1/file', hosts), /allowed/);
});

test('XLSX requires actual spreadsheet content and preserves the private staged copy', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-xlsx-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'report.xlsx');
  await fs.writeFile(source, xlsxBuffer());
  assert.equal(sanitizeFilename('../../relatorio ç.xlsx'), 'relatorio _.xlsx');
  assert.throws(() => sanitizeFilename('macros.xlsm'), /valid/);
  const validated = await validateXlsxFile(source, [root], 20000);
  const staged = await stageDocument(validated, path.join(root, 'queue'), 'xlsx');
  assert.match(staged, /\.xlsx$/);
  assert.deepEqual(await fs.readFile(staged), await fs.readFile(source));
  assert.equal((await fs.stat(staged)).mode & 0o777, 0o600);
  await assert.rejects(validateXlsxFile(source, [root], 10), /size/);
  await assert.rejects(validatePdfFile(source, [root], 20000), /PDF/);
  await fs.writeFile(source, '%PDF-1.4\n%%EOF\n');
  await assert.rejects(validateXlsxFile(source, [root], 20000), /XLSX/);
  await fs.writeFile(source, zipBuffer({ 'readme.txt': 'not a spreadsheet' }));
  await assert.rejects(validateXlsxFile(source, [root], 20000), /XLSX/);
});

test('XLSX blocks symlink escape from the allowed directory', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-xlsx-link-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'allowed'));
  await fs.writeFile(path.join(root, 'outside.xlsx'), xlsxBuffer());
  await fs.symlink(path.join(root, 'outside.xlsx'), path.join(root, 'allowed', 'link.xlsx'));
  await assert.rejects(validateXlsxFile(path.join(root, 'allowed', 'link.xlsx'), [path.join(root, 'allowed')], 20000), /outside/);
});
