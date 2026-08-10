import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';

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
