import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';

export function sanitizeFilename(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('filename is required');
  const clean = path.basename(value.trim()).replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^\.+/, '');
  if (!clean || clean.length > 180 || path.extname(clean).toLowerCase() !== '.pdf') {
    throw new Error('filename must be a valid .pdf name');
  }
  return clean;
}

function isWithin(file, root) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export async function validatePdfFile(inputPath, allowedRoots, maxBytes) {
  if (typeof inputPath !== 'string' || !path.isAbsolute(inputPath)) {
    throw new Error('path must be an absolute file path');
  }

  let realFile;
  try {
    realFile = await fs.realpath(inputPath);
  } catch {
    throw new Error('PDF file does not exist or is not accessible');
  }

  const realRoots = await Promise.all(allowedRoots.map(async (root) => {
    try { return await fs.realpath(root); } catch { return path.resolve(root); }
  }));
  if (!realRoots.some((root) => isWithin(realFile, root))) {
    throw new Error('PDF path is outside ALLOWED_FILE_PATHS');
  }

  const stat = await fs.stat(realFile);
  if (!stat.isFile()) throw new Error('PDF path is not a regular file');
  if (stat.size <= 0 || stat.size > maxBytes) throw new Error('PDF file size is outside the allowed range');

  const type = await fileTypeFromFile(realFile);
  if (!type || type.mime !== 'application/pdf' || type.ext !== 'pdf') {
    throw new Error('file content is not a PDF');
  }
  return { realPath: realFile, size: stat.size };
}

export function validateDownloadUrl(value, allowedHosts) {
  let url;
  try { url = new URL(value); } catch { throw new Error('url must be a valid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.includes(url.hostname)) {
    throw new Error('url must use HTTPS and an allowed download host');
  }
  return url;
}

export async function downloadPdf(inputUrl, allowedHosts, maxBytes, redirects = 0) {
  const url = validateDownloadUrl(inputUrl, allowedHosts);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/pdf' }
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 3) throw new Error('PDF download exceeded the redirect limit');
    const location = response.headers.get('location');
    if (!location) throw new Error('PDF download returned an invalid redirect');
    return downloadPdf(new URL(location, url).href, allowedHosts, maxBytes, redirects + 1);
  }
  if (!response.ok || !response.body) throw new Error(`PDF download failed with HTTP ${response.status}`);

  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && (declaredSize <= 0 || declaredSize > maxBytes)) {
    throw new Error('PDF download size is outside the allowed range');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('PDF download size is outside the allowed range');
    chunks.push(chunk);
  }
  if (size === 0) throw new Error('PDF download is empty');

  const buffer = Buffer.concat(chunks, size);
  const type = await fileTypeFromBuffer(buffer);
  if (!type || type.mime !== 'application/pdf' || type.ext !== 'pdf') {
    throw new Error('downloaded content is not a PDF');
  }
  return { buffer, size };
}
