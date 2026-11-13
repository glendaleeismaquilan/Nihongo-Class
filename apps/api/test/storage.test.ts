import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { describe, expect, it } from "vitest";
import { supabaseStore } from "../src/lib/storage";

/**
 * An in-memory stand-in for Supabase Storage's REST API, covering the calls
 * the storage client makes: buckets, upload, list, remove, signed URLs, HEAD.
 */
function fakeSupabase(key: string) {
  const buckets = new Map<string, { public: boolean; objects: Map<string, { body: Buffer; contentType: string; cacheControl: string }> }>();
  const calls: string[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const notFound = () => json(400, { statusCode: "404", error: "not_found", message: "Object not found" });

  const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""));
    calls.push(`${method} ${path}`);

    // Signed download links carry their own token instead of the key.
    if (path.startsWith("/object/sign/") && method === "GET") {
      const [bucketId, ...rest] = path.slice("/object/sign/".length).split("/");
      const obj = url.searchParams.get("token") === "t" ? buckets.get(bucketId)?.objects.get(rest.join("/")) : undefined;
      if (!obj) return notFound();
      return new Response(new Uint8Array(obj.body), { status: 200, headers: { "content-type": obj.contentType, "content-length": String(obj.body.length) } });
    }
    if (headers.get("apikey") !== key || headers.get("authorization") !== `Bearer ${key}`) return json(401, { message: "Invalid key" });

    if (path.startsWith("/bucket")) {
      const id = path.split("/")[2];
      if (method === "GET") return buckets.has(id) ? json(200, { id, name: id, public: buckets.get(id)!.public }) : json(400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
      const body = JSON.parse(String(init.body));
      buckets.set(body.id ?? body.name, { public: !!body.public, objects: new Map() });
      return json(200, { name: body.id ?? body.name });
    }
    if (path.startsWith("/object/list/")) {
      const b = buckets.get(path.slice("/object/list/".length))!;
      const { prefix, limit } = JSON.parse(String(init.body));
      const items = [...b.objects.keys()]
        .filter((k) => k.startsWith(`${prefix}/`) && !k.slice(prefix.length + 1).includes("/"))
        .slice(0, limit)
        .map((k) => ({ name: k.slice(prefix.length + 1), id: `id-${k}` }));
      return json(200, items);
    }
    if (path.startsWith("/object/sign/")) {
      const [bucketId, ...rest] = path.slice("/object/sign/".length).split("/");
      if (!buckets.get(bucketId)?.objects.has(rest.join("/"))) return notFound();
      return json(200, { signedURL: `/object/sign/${bucketId}/${rest.join("/")}?token=t` });
    }
    // Object metadata: storage-js 2.118+ answers exists() from here (older clients sent HEAD).
    // Supabase reports a missing key with code NoSuchKey.
    if (path.startsWith("/object/info/") && method === "GET") {
      const [bucketId, ...rest] = path.slice("/object/info/".length).split("/");
      const obj = buckets.get(bucketId)?.objects.get(rest.join("/"));
      if (!obj) return json(400, { statusCode: "404", code: "NoSuchKey", error: "not_found", message: "Object not found" });
      return json(200, { id: `id-${rest.join("/")}`, name: rest.join("/"), bucket_id: bucketId, size: obj.body.length, content_type: obj.contentType, cache_control: obj.cacheControl });
    }
    const [bucketId, ...rest] = path.slice("/object/".length).split("/");
    const b = buckets.get(bucketId);
    if (!b) return json(400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
    const objectPath = rest.join("/");
    if (method === "DELETE") {
      for (const p of JSON.parse(String(init.body)).prefixes as string[]) b.objects.delete(p);
      return json(200, []);
    }
    if (method === "HEAD") return b.objects.has(objectPath) ? new Response(null, { status: 200 }) : new Response(null, { status: 400 });
    if (method === "POST" || method === "PUT") {
      b.objects.set(objectPath, { body: Buffer.from(init.body as Uint8Array), contentType: headers.get("content-type") ?? "", cacheControl: headers.get("cache-control") ?? "" });
      return json(200, { Id: objectPath, Key: `${bucketId}/${objectPath}` });
    }
    return json(405, { message: "unsupported" });
  }) as typeof fetch;

  return { fakeFetch, buckets, calls };
}

const tmp = (name: string, body: string) => {
  const p = join(mkdtempSync(join(tmpdir(), "nc-storage-")), name);
  writeFileSync(p, body);
  return p;
};

describe("Supabase Storage (STORAGE_PROVIDER=supabase)", () => {
  const key = "sb_secret_test";
  const make = () => {
    const fake = fakeSupabase(key);
    const store = supabaseStore({ url: "https://demo.supabase.co/", key, bucket: "nihongo-files", publicBucket: "nihongo-audio", fetch: fake.fakeFetch });
    return { ...fake, store };
  };

  it("creates a private and a public bucket on first use, once", async () => {
    const { store, buckets, calls } = make();
    await store.put(tmp("a.pdf", "%PDF-1"), "drive/u1/a", "application/pdf");
    await store.put(tmp("b.pdf", "%PDF-2"), "drive/u1/b", "application/pdf");
    expect(buckets.get("nihongo-files")?.public).toBe(false);
    expect(buckets.get("nihongo-audio")?.public).toBe(true);
    expect(calls.filter((c) => c.startsWith("POST /bucket"))).toHaveLength(2);
  });

  it("stores a file with its type and streams it back with its size", async () => {
    const { store, buckets } = make();
    await store.put(tmp("notes.pdf", "%PDF-1.4 hello"), "classes/c1/materials/m1/att1-notes.pdf", "application/pdf");
    expect(buckets.get("nihongo-files")!.objects.get("classes/c1/materials/m1/att1-notes.pdf")!.contentType).toBe("application/pdf");
    const opened = await store.open("classes/c1/materials/m1/att1-notes.pdf");
    expect(opened?.size).toBe(14);
    expect(await text(opened!.stream)).toBe("%PDF-1.4 hello");
    expect(await store.open("classes/c1/materials/m1/missing.pdf")).toBeNull();
  });

  it("puts built-in audio in the public bucket with a long cache and returns its public URL", async () => {
    const { store, buckets } = make();
    const url = await store.putPublic(tmp("a.mp3", "ID3"), "builtin/audio/flashcards/f1/x.mp3", "audio/mpeg");
    expect(url).toBe("https://demo.supabase.co/storage/v1/object/public/nihongo-audio/builtin/audio/flashcards/f1/x.mp3");
    expect(buckets.get("nihongo-audio")!.objects.get("builtin/audio/flashcards/f1/x.mp3")!.cacheControl).toBe("max-age=31536000");
    expect(await store.exists("builtin/audio/flashcards/f1/x.mp3")).toBe(true);
  });

  it("removes single files from either bucket and whole material folders", async () => {
    const { store } = make();
    await store.put(tmp("1.pdf", "1"), "classes/c1/materials/m1/a-1.pdf", "application/pdf");
    await store.put(tmp("2.pdf", "2"), "classes/c1/materials/m1/b-2.pdf", "application/pdf");
    await store.put(tmp("3.pdf", "3"), "classes/c1/materials/m2/c-3.pdf", "application/pdf");
    await store.putPublic(tmp("a.mp3", "ID3"), "builtin/audio/q/1.mp3", "audio/mpeg");

    await store.remove("builtin/audio/q/1.mp3");
    expect(await store.exists("builtin/audio/q/1.mp3")).toBe(false);

    await store.removePrefix("classes/c1/materials/m1/");
    expect(await store.exists("classes/c1/materials/m1/a-1.pdf")).toBe(false);
    expect(await store.exists("classes/c1/materials/m1/b-2.pdf")).toBe(false);
    expect(await store.exists("classes/c1/materials/m2/c-3.pdf")).toBe(true);
  });

  it("surfaces a wrong key as an error instead of failing silently", async () => {
    const fake = fakeSupabase(key);
    const store = supabaseStore({ url: "https://demo.supabase.co", key: "wrong", bucket: "nihongo-files", publicBucket: "nihongo-audio", fetch: fake.fakeFetch });
    await expect(store.put(tmp("a.pdf", "x"), "drive/u1/a", "application/pdf")).rejects.toThrow();
  });
});
