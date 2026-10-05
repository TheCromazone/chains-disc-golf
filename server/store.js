// Match storage: one JSON document per match, written with an ETag check so two turns can never overwrite each other.
// On Vercel it is a private Blob store (BLOB_READ_WRITE_TOKEN, injected when the store is connected to the project);
// without one (local dev, tests) it is a folder of JSON files with the same contract.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export class Conflict extends Error {}
const path = id => `matches/${id}.json`;
const useBlob = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL);   // on Vercel always the Blob store (the function's disk is read-only)

async function blobLoad(id) {
  const { get } = await import('@vercel/blob');
  const r = await get(path(id), { access: 'private', useCache: false });   // origin read: a cached copy would make every write conflict
  if (!r || !r.stream) return null;
  // A body over ~1 KB is served compressed with a weak ETag (W/"…"); a conditional put only matches the strong form of the same value.
  return { data: JSON.parse(await new Response(r.stream).text()), etag: String(r.blob.etag).replace(/^W\//, '') };
}
async function blobSave(id, data, etag) {
  const { put, BlobPreconditionFailedError } = await import('@vercel/blob');
  try {
    const r = await put(path(id), JSON.stringify(data), { access: 'private', contentType: 'application/json', addRandomSuffix: false,
      cacheControlMaxAge: 60, ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }) });
    return r.etag;
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError || /already exists|precondition|conflict/i.test(String(e?.message))) throw new Conflict();   // a lost race (412) or a write racing another write (409)
    throw e;
  }
}

const dir = () => resolve(process.env.CHAINS_DATA_DIR || '.data');
const fileEtag = text => createHash('sha1').update(text).digest('hex');
async function fileLoad(id) {
  try { const text = await readFile(join(dir(), path(id)), 'utf8'); return { data: JSON.parse(text), etag: fileEtag(text) }; }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
const locks = new Map();   // one writer per match in this process, so the check-then-write below is atomic here
async function fileSave(id, data, etag) {
  const prev = locks.get(id) || Promise.resolve(); let release; locks.set(id, new Promise(r => release = r));
  await prev;
  try {
    const file = join(dir(), path(id)); await mkdir(join(dir(), 'matches'), { recursive: true });
    const current = await readFile(file, 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (etag ? current === null || fileEtag(current) !== etag : current !== null) throw new Conflict();
    const text = JSON.stringify(data), tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, text); await rename(tmp, file);
    return fileEtag(text);
  } finally { release(); }
}

export const loadMatch = id => (useBlob() ? blobLoad : fileLoad)(id);
export const saveMatch = (id, data, etag = null) => (useBlob() ? blobSave : fileSave)(id, data, etag);

// Read, change, write; on a lost race read again and re-apply (the change function must be safe to repeat).
export async function updateMatch(id, change) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const cur = await loadMatch(id); if (!cur) return null;
    const result = await change(cur.data);
    try { await saveMatch(id, cur.data, cur.etag); return { match: cur.data, result }; }
    catch (e) { if (!(e instanceof Conflict)) throw e; await new Promise(r => setTimeout(r, Math.random() * Math.min(1200, 60 * 2 ** attempt))); }   // full jitter: racing writers spread out
  }
  throw new Error('The match is busy. Try again.');
}
export const storageKind = () => useBlob() ? 'blob' : 'file';

