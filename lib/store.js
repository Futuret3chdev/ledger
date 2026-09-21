import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { emptyPractice } from './practice.js';
import { emptyBook } from './validate.js';

const BLOB_PATH = 'ledger/state.json';
const PRACTICE_BLOB = 'ledger/practice.json';

export function storageMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.VERCEL) return 'missing';
  return 'file';
}

function filePath() {
  return process.env.LEDGER_DATA_FILE || path.join(process.cwd(), 'data', 'ledger.json');
}

function practiceFilePath() {
  return path.join(path.dirname(filePath()), 'practice.json');
}

async function readFileBook() {
  try {
    const raw = await readFile(filePath(), 'utf8');
    return { book: JSON.parse(raw), etag: null };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { book: emptyBook(), etag: null };
    throw err;
  }
}

async function writeFileBook(book) {
  const dest = filePath();
  await mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(book), 'utf8');
  await rename(tmp, dest);
}

async function readBlobBook() {
  try {
    const result = await get(BLOB_PATH, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return { book: emptyBook(), etag: null };
    const text = await new Response(result.stream).text();
    if (!text) return { book: emptyBook(), etag: result.blob.etag };
    return { book: JSON.parse(text), etag: result.blob.etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError || err?.name === 'BlobNotFoundError') {
      return { book: emptyBook(), etag: null };
    }
    throw err;
  }
}

async function writeBlobBook(book, etag) {
  await put(BLOB_PATH, JSON.stringify(book), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
    ...(etag ? { ifMatch: etag } : {}),
  });
}

export async function loadBook() {
  const mode = storageMode();
  if (mode === 'missing') {
    const err = new Error('Storage is not connected');
    err.code = 'NO_STORAGE';
    throw err;
  }
  const { book } = mode === 'blob' ? await readBlobBook() : await readFileBook();
  return book;
}

export async function saveBook(incoming) {
  const mode = storageMode();
  if (mode === 'missing') {
    const err = new Error('Storage is not connected');
    err.code = 'NO_STORAGE';
    throw err;
  }
  const current = mode === 'blob' ? await readBlobBook() : await readFileBook();
  if (incoming.version !== current.book.version) {
    const err = new Error('The desk was updated somewhere else');
    err.code = 'CONFLICT';
    err.book = current.book;
    throw err;
  }
  const next = {
    ...incoming,
    version: current.book.version + 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    if (mode === 'blob') await writeBlobBook(next, current.etag);
    else await writeFileBook(next);
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError || err?.name === 'BlobPreconditionFailedError') {
      const again = await readBlobBook();
      const conflict = new Error('The desk was updated somewhere else');
      conflict.code = 'CONFLICT';
      conflict.book = again.book;
      throw conflict;
    }
    throw err;
  }
  return next;
}

async function readFilePractice() {
  try {
    const raw = await readFile(practiceFilePath(), 'utf8');
    return { doc: JSON.parse(raw), etag: null };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { doc: emptyPractice(), etag: null };
    throw err;
  }
}

async function writeFilePractice(doc) {
  const dest = practiceFilePath();
  await mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(doc), 'utf8');
  await rename(tmp, dest);
}

async function readBlobPractice() {
  try {
    const result = await get(PRACTICE_BLOB, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return { doc: emptyPractice(), etag: null };
    const text = await new Response(result.stream).text();
    if (!text) return { doc: emptyPractice(), etag: result.blob.etag };
    return { doc: JSON.parse(text), etag: result.blob.etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError || err?.name === 'BlobNotFoundError') {
      return { doc: emptyPractice(), etag: null };
    }
    throw err;
  }
}

async function writeBlobPractice(doc, etag) {
  await put(PRACTICE_BLOB, JSON.stringify(doc), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
    ...(etag ? { ifMatch: etag } : {}),
  });
}

export async function loadPractice() {
  const mode = storageMode();
  if (mode === 'missing') {
    const err = new Error('Storage is not connected');
    err.code = 'NO_STORAGE';
    throw err;
  }
  const { doc } = mode === 'blob' ? await readBlobPractice() : await readFilePractice();
  return doc?.keepers ? doc : emptyPractice();
}

export async function savePractice(incoming) {
  const mode = storageMode();
  if (mode === 'missing') {
    const err = new Error('Storage is not connected');
    err.code = 'NO_STORAGE';
    throw err;
  }
  const current = mode === 'blob' ? await readBlobPractice() : await readFilePractice();
  const currentDoc = current.doc?.keepers ? current.doc : emptyPractice();
  if (incoming.version !== currentDoc.version) {
    const err = new Error('The list was updated somewhere else');
    err.code = 'CONFLICT';
    err.book = currentDoc;
    throw err;
  }
  const next = { ...incoming, version: currentDoc.version + 1, updatedAt: new Date().toISOString() };
  try {
    if (mode === 'blob') await writeBlobPractice(next, current.etag);
    else await writeFilePractice(next);
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError || err?.name === 'BlobPreconditionFailedError') {
      const again = await readBlobPractice();
      const conflict = new Error('The list was updated somewhere else');
      conflict.code = 'CONFLICT';
      conflict.book = again.doc;
      throw conflict;
    }
    throw err;
  }
  return next;
}
