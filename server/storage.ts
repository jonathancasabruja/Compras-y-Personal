/**
 * Supabase Storage backed uploader for PO attachments.
 *
 * Earlier versions of this module routed through the Manus forge proxy
 * (BUILT_IN_FORGE_API_URL / _KEY) — those env vars were never set on
 * Railway, so the upload always silent-failed. Now we talk directly to
 * Supabase Storage:
 *
 *   SUPABASE_URL              — https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — private service role key (NEVER exposed
 *                               to the browser; we call the storage API
 *                               from the server only)
 *
 * Bucket: `po-attachments` (public read, server-only write). URLs
 * returned by getPublicUrl are permanent and safe to store in
 * purchase_order_attachments.file_url.
 *
 * Soft-fail preserved: if either env var is missing, we skip the upload
 * and return an empty url so the attachment row still gets created.
 * That matches the UX we had before (amber banner in the UI) so nothing
 * crashes when the vars aren't set.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "po-attachments";

let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

export async function storagePut(
  relKey: string,
  data: Uint8Array | Buffer | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const client = getClient();
  if (!client) {
    console.warn(
      `[storage] Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), skipping upload for ${key}`,
    );
    return { key, url: "" };
  }
  // supabase-js accepts Buffer / Uint8Array / Blob / ArrayBuffer / string.
  // Normalize to Uint8Array so the SDK picks up the binary path.
  let body: Uint8Array | string;
  if (typeof data === "string") body = data;
  else if (data instanceof Uint8Array) body = data;
  else body = new Uint8Array(data as ArrayBuffer);

  const { error } = await client.storage.from(BUCKET).upload(key, body, {
    contentType,
    upsert: true, // timestamp is in the key already; if the user re-uploads same millisecond, overwrite
  });
  if (error) {
    console.warn(
      `[storage] upload failed for ${key}: ${error.message} — continuing without cloud copy`,
    );
    return { key, url: "" };
  }
  const { data: pub } = client.storage.from(BUCKET).getPublicUrl(key);
  return { key, url: pub?.publicUrl ?? "" };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const client = getClient();
  if (!client) return { key, url: "" };
  const { data: pub } = client.storage.from(BUCKET).getPublicUrl(key);
  return { key, url: pub?.publicUrl ?? "" };
}

/**
 * Fetch the raw bytes of a stored object. Used by the AI correction chat
 * so we can re-send the PDF to Claude without asking the client to
 * re-upload it. Returns null if storage isn't configured or the download
 * fails.
 */
export async function storageDownload(relKey: string): Promise<Buffer | null> {
  const key = normalizeKey(relKey);
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(BUCKET).download(key);
  if (error || !data) {
    console.warn(`[storage] download failed for ${key}: ${error?.message ?? "no data"}`);
    return null;
  }
  // Blob → ArrayBuffer → Buffer
  const arrayBuf = await data.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  const client = getClient();
  if (!client) return;
  const { error } = await client.storage.from(BUCKET).remove([key]);
  if (error) {
    console.warn(`[storage] delete failed for ${key}: ${error.message}`);
  }
}

export function isStorageConfigured(): boolean {
  return getClient() !== null;
}
