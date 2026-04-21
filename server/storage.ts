/**
 * Manus WebDev storage proxy — soft-fail edition.
 *
 * When BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY are set on Railway
 * (same proxy brewery_dashboard uses), file uploads land in Manus-managed
 * object storage and we get back a public URL. When the env vars are NOT
 * set, upload() silently returns `{ key, url: "" }` so the caller can still
 * persist a DB record; there's just no cloud backup of the raw file.
 *
 * This matches the same pattern used in facturacion-cb for Telegram PDF
 * receipts — keeps the app from crashing when forge isn't configured yet.
 */

function getEnv(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.BUILT_IN_FORGE_API_URL ?? "";
  const apiKey = process.env.BUILT_IN_FORGE_API_KEY ?? "";
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function ensureTrailingSlash(v: string): string {
  return v.endsWith("/") ? v : `${v}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(baseUrl: string, relKey: string, apiKey: string): Promise<string> {
  const url = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return "";
  const body = (await res.json()) as { url?: string };
  return body.url ?? "";
}

function toFormData(data: Uint8Array | string, contentType: string, fileName: string): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

export async function storagePut(
  relKey: string,
  data: Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const cfg = getEnv();
  if (!cfg) {
    console.warn(`[storage] forge not configured, skipping upload for ${key}`);
    return { key, url: "" };
  }
  const uploadUrl = buildUploadUrl(cfg.baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  try {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: formData,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      console.warn(
        `[storage] upload failed (${res.status} ${res.statusText}): ${msg}`,
      );
      return { key, url: "" };
    }
    const body = (await res.json()) as { url?: string };
    return { key, url: body.url ?? "" };
  } catch (err: any) {
    console.warn(`[storage] upload threw: ${err?.message ?? err}`);
    return { key, url: "" };
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const cfg = getEnv();
  if (!cfg) return { key, url: "" };
  return { key, url: await buildDownloadUrl(cfg.baseUrl, key, cfg.apiKey) };
}

export function isStorageConfigured(): boolean {
  return getEnv() !== null;
}
