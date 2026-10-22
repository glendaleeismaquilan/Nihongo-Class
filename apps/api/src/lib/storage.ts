import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StorageClient } from "@supabase/storage-js";
import { getDownloadURL } from "firebase-admin/storage";
import { env } from "../env";
import { bucket } from "../firebase";
import { logger } from "../logger";

/**
 * Where uploaded files live (decision 67): Cloud Storage for Firebase, or
 * Supabase Storage (STORAGE_PROVIDER=supabase), which has a free plan that
 * needs no card. Routes only use the functions exported here.
 */
interface ObjectStore {
  put(localPath: string, storagePath: string, contentType: string): Promise<void>;
  /** Stores public, long-cached audio and returns its URL. */
  putPublic(localPath: string, storagePath: string, contentType: string): Promise<string>;
  remove(storagePath: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
  open(storagePath: string): Promise<{ size: number | null; stream: Readable } | null>;
  exists(storagePath: string): Promise<boolean>;
}

const YEAR_SECONDS = 31_536_000;

const firebaseStore: ObjectStore = {
  async put(localPath, storagePath, contentType) {
    const file = bucket.file(storagePath);
    await pipeline(createReadStream(localPath), file.createWriteStream({ resumable: false, contentType, metadata: { contentType } }));
  },

  /**
   * §7.5: built-in audio is served by Firebase download-token URLs, which are
   * fast, seekable (range requests), and independent of the deny-all rules.
   * getDownloadURL() reads the token back through the Firebase Storage REST
   * API; the Storage emulator applies the deny-all rules to that read, so
   * against the emulator we build the same URL from the token we just set.
   */
  async putPublic(localPath, storagePath, contentType) {
    const token = randomUUID();
    const file = bucket.file(storagePath);
    await pipeline(
      createReadStream(localPath),
      file.createWriteStream({ resumable: false, contentType, metadata: { contentType, cacheControl: `public, max-age=${YEAR_SECONDS}`, metadata: { firebaseStorageDownloadTokens: token } } }),
    );
    if (!env.FIREBASE_STORAGE_EMULATOR_HOST) return getDownloadURL(file);
    return `http://${env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  },

  async remove(storagePath) {
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
  },

  async removePrefix(prefix) {
    await bucket.deleteFiles({ prefix, force: true });
  },

  async open(storagePath) {
    const object = bucket.file(storagePath);
    const [exists] = await object.exists();
    if (!exists) return null;
    const [meta] = await object.getMetadata();
    return { size: meta.size ? Number(meta.size) : null, stream: object.createReadStream() };
  },

  async exists(storagePath) {
    return (await bucket.file(storagePath).exists())[0];
  },
};

/**
 * Two buckets: a private one for class materials and My Drive (served only
 * through the API's signed tickets) and a public one for built-in audio. The
 * API creates both on first use with the project's secret key.
 */
export function supabaseStore(opts: { url: string; key: string; bucket: string; publicBucket: string; fetch?: typeof fetch }): ObjectStore {
  const client = new StorageClient(`${opts.url.replace(/\/$/, "")}/storage/v1`, { apikey: opts.key, Authorization: `Bearer ${opts.key}` }, opts.fetch);
  const doFetch = opts.fetch ?? fetch;
  let ready: Promise<void> | null = null;

  const ensureBuckets = () =>
    (ready ??= (async () => {
      for (const [id, isPublic] of [
        [opts.bucket, false],
        [opts.publicBucket, true],
      ] as const) {
        const found = await client.getBucket(id);
        if (!found.error) continue;
        const made = await client.createBucket(id, { public: isPublic });
        // Another server instance may have created it in the meantime.
        if (made.error && !/exist|duplicate/i.test(made.error.message)) throw made.error;
      }
    })().catch((err) => {
      ready = null;
      throw err;
    }));

  const upload = async (bucketId: string, localPath: string, storagePath: string, contentType: string, cacheSeconds: number) => {
    await ensureBuckets();
    const { error } = await client.from(bucketId).upload(storagePath, await readFile(localPath), { contentType, upsert: true, cacheControl: String(cacheSeconds) });
    if (error) throw error;
  };

  return {
    put: (localPath, storagePath, contentType) => upload(opts.bucket, localPath, storagePath, contentType, 3600),

    async putPublic(localPath, storagePath, contentType) {
      await upload(opts.publicBucket, localPath, storagePath, contentType, YEAR_SECONDS);
      return client.from(opts.publicBucket).getPublicUrl(storagePath).data.publicUrl;
    },

    async remove(storagePath) {
      await ensureBuckets();
      // Paths are unique across both buckets, and removing a missing file is a no-op.
      for (const id of [opts.bucket, opts.publicBucket]) {
        const { error } = await client.from(id).remove([storagePath]);
        if (error) throw error;
      }
    },

    async removePrefix(prefix) {
      await ensureBuckets();
      const folder = prefix.replace(/\/$/, "");
      // Material folders hold files only, no subfolders.
      for (;;) {
        const { data, error } = await client.from(opts.bucket).list(folder, { limit: 100 });
        if (error) throw error;
        const files = (data ?? []).filter((f) => f.id);
        if (!files.length) return;
        const removed = await client.from(opts.bucket).remove(files.map((f) => `${folder}/${f.name}`));
        if (removed.error) throw removed.error;
      }
    },

    async open(storagePath) {
      await ensureBuckets();
      const signed = await client.from(opts.bucket).createSignedUrl(storagePath, 60);
      if (signed.error) return null;
      const res = await doFetch(signed.data.signedUrl);
      if (!res.ok || !res.body) return null;
      const length = res.headers.get("content-length");
      return { size: length ? Number(length) : null, stream: Readable.fromWeb(res.body as never) };
    },

    async exists(storagePath) {
      await ensureBuckets();
      for (const id of [opts.bucket, opts.publicBucket]) {
        if ((await client.from(id).exists(storagePath)).data) return true;
      }
      return false;
    },
  };
}

let store: ObjectStore =
  env.STORAGE_PROVIDER === "supabase"
    ? supabaseStore({ url: env.SUPABASE_URL!, key: env.SUPABASE_SECRET_KEY!, bucket: env.SUPABASE_BUCKET, publicBucket: env.SUPABASE_PUBLIC_BUCKET })
    : firebaseStore;

/** Test hook: swap the store (pass null to restore the configured one). */
export function setObjectStore(next: ObjectStore | null) {
  store = next ?? (env.STORAGE_PROVIDER === "supabase" ? supabaseStore({ url: env.SUPABASE_URL!, key: env.SUPABASE_SECRET_KEY!, bucket: env.SUPABASE_BUCKET, publicBucket: env.SUPABASE_PUBLIC_BUCKET }) : firebaseStore);
}

/** Uploads a local temp file to storage. */
export async function putFile(localPath: string, storagePath: string, contentType: string) {
  await store.put(localPath, storagePath, contentType);
}

/** Built-in audio: a public URL that browsers can stream and seek. */
export function putPublicAudio(localPath: string, storagePath: string, contentType: string): Promise<string> {
  return store.putPublic(localPath, storagePath, contentType);
}

export async function deleteObject(storagePath: string | null | undefined) {
  if (!storagePath) return;
  await store.remove(storagePath).catch((err) => logger.warn({ err, storagePath }, "couldn't delete storage object"));
}

export async function deletePrefix(prefix: string) {
  await store.removePrefix(prefix).catch((err) => logger.warn({ err, prefix }, "couldn't delete storage prefix"));
}

/** Opens a stored file for streaming, or returns null when it doesn't exist. */
export function openObject(storagePath: string) {
  return store.open(storagePath);
}

export function objectExists(storagePath: string) {
  return store.exists(storagePath);
}
