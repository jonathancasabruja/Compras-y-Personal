/**
 * External ingestion endpoints for the Invoice Library.
 *
 * These are raw Express routes (not tRPC) because they receive multipart
 * form POSTs from third-party services — the tRPC adapter wraps everything
 * in JSON-RPC which is wrong for this shape. Each route:
 *
 *   1. Authenticates with a shared secret (header or query param)
 *   2. Pulls a PDF attachment out of whatever payload the provider sent
 *   3. Runs it through the same extract → rename → storage → insert
 *      pipeline that the web upload uses
 *
 * Env vars:
 *   INGEST_SECRET — arbitrary long random string. Senders must include it
 *                   as ?secret=... or X-Ingest-Secret: ...
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN — needed to fetch the actual
 *                   media bytes from Twilio's CDN for WhatsApp ingestion
 *
 * ═══════════════════════════════════════════════════════════════════════
 * EMAIL INGESTION SETUP (choose one provider, configure, point at /ingest/email)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Postmark Inbound Parse (recommended — free tier 100/month):
 *     1. postmarkapp.com → sign up → Servers → Create inbound stream
 *     2. Copy the generated inbound email address
 *        (e.g. abc123@inbound.postmarkapp.com) or alias a custom domain
 *     3. Settings → Set up webhook → POST to:
 *        https://compras.casabruja.com/ingest/email?secret=$INGEST_SECRET
 *     4. In Railway, set INGEST_SECRET to a long random string
 *     5. Forward invoices to the inbound address — they appear in the
 *        library with the sender email saved as uploadedBy
 *
 *   Alternative: Cloudflare Email Routing → forwards the email to a
 *   custom worker that re-POSTs to /ingest/email. More setup, free.
 *
 *   SendGrid Inbound Parse also works — payload shape is similar but the
 *   attachment fields are named slightly differently; we support both.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHATSAPP INGESTION SETUP (Twilio Business API)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *     1. Twilio Console → Messaging → Try it Out → Send a WhatsApp message
 *        (if still on sandbox; production requires an approved business
 *        number)
 *     2. Settings → WhatsApp Senders → Webhook URL for incoming messages:
 *        https://compras.casabruja.com/ingest/whatsapp?secret=$INGEST_SECRET
 *     3. Forward a PDF in the sandbox / production chat — the webhook
 *        pulls the media URL, authenticates with TWILIO_ACCOUNT_SID +
 *        TWILIO_AUTH_TOKEN, downloads the PDF, pushes into the library
 *     4. The sender's phone number is saved as uploadedBy
 */

import type { Request, Response } from "express";
import { storagePut, isStorageConfigured } from "./storage";
import { extractPoFromPdf, type InvoiceCategory } from "./invoiceExtractor";
import { createSupplierInvoice, getManualCategoryExamples } from "./invoiceLibraryDb";

function checkSecret(req: Request): boolean {
  const expected = process.env.INGEST_SECRET;
  if (!expected) return false; // fail-closed when unset
  const got =
    (req.query.secret as string | undefined) ??
    (req.header("X-Ingest-Secret") || req.header("x-ingest-secret") || "");
  return got.length === expected.length && got === expected;
}

function sanitizeForFilename(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "invoice";
}

async function ingestPdf(
  buffer: Buffer,
  originalFilename: string,
  uploadedBy: string | null,
) {
  const base64 = buffer.toString("base64");
  // Pull past manual-override examples so the model learns from them. Cap
  // at 30 so the prompt doesn't explode. On DB failure, just proceed
  // without examples — we'd rather classify without hints than block.
  const manualCategoryExamples = await getManualCategoryExamples(30).catch(() => []);
  const extracted = await extractPoFromPdf(base64, { manualCategoryExamples }).catch((err) => {
    console.warn("[ingest] extraction failed, saving with placeholders", err);
    return null;
  });
  const category: InvoiceCategory = (extracted?.category ?? "other") as InvoiceCategory;
  const supplier = extracted?.supplier?.trim() || "unknown-supplier";
  const date = extracted?.date || new Date().toISOString().split("T")[0];
  const storedFilename = `${sanitizeForFilename(supplier)}-${sanitizeForFilename(date)}.pdf`;
  const key = `invoices/${category}/${Date.now()}-${storedFilename}`;
  const stored = await storagePut(key, new Uint8Array(buffer), "application/pdf");

  return createSupplierInvoice({
    fileUrl: stored.url,
    fileKey: stored.key,
    originalFilename,
    storedFilename,
    supplier,
    invoiceNumber: extracted?.invoiceNumber ?? null,
    invoiceDate: date,
    currency: extracted?.currency ?? "USD",
    totalAmount: extracted?.totalAmount ?? 0,
    category,
    categoryWasManual: false,
    briefDescription: extracted?.briefDescription ?? null,
    extractedData: extracted as any,
    uploadedBy,
  });
}

// ─── /ingest/folder — simple JSON API for the OneDrive watcher ─────────────
// Accepts `{ filename, dataBase64, uploadedBy }` and runs the same
// extract → rename → store → insert pipeline as the browser upload. Auth
// is the shared INGEST_SECRET. Designed for Jonathan's folder-sync
// watcher script (see invoice-watcher/ under Projecto Revisado).
export async function handleFolderIngest(req: Request, res: Response) {
  if (!checkSecret(req)) return res.status(401).json({ error: "unauthorized" });
  if (!isStorageConfigured())
    return res.status(503).json({ error: "storage not configured" });

  const { filename, dataBase64, uploadedBy } = req.body ?? {};
  if (typeof filename !== "string" || typeof dataBase64 !== "string") {
    return res.status(400).json({ error: "filename + dataBase64 required" });
  }
  try {
    const buf = Buffer.from(dataBase64, "base64");
    const row = await ingestPdf(
      buf,
      filename,
      typeof uploadedBy === "string" && uploadedBy ? uploadedBy : "onedrive-watcher",
    );
    if (!row) return res.status(500).json({ error: "insert failed" });
    return res.json({
      ok: true,
      id: row.id,
      storedFilename: row.storedFilename,
      supplier: row.supplier,
      category: row.category,
      invoiceDate: row.invoiceDate,
      totalAmount: row.totalAmount,
      currency: row.currency,
    });
  } catch (err: any) {
    console.error("[ingest/folder] error", err);
    return res.status(500).json({ error: err?.message ?? "ingest error" });
  }
}

// ─── /ingest/email ──────────────────────────────────────────────────────────
// Accepts the normalized multipart/form-data that Postmark Inbound and
// SendGrid Inbound Parse both send. Field names differ slightly; we try
// both shapes. Attachments arrive as `attachment1`, `attachment2`, ... on
// SendGrid, or as a JSON array `Attachments` containing {Name,Content-base64,...}
// on Postmark. Postmark is simpler so we prefer it if present.

export async function handleEmailIngest(req: Request, res: Response) {
  if (!checkSecret(req)) return res.status(401).json({ error: "unauthorized" });
  if (!isStorageConfigured())
    return res.status(503).json({ error: "storage not configured" });

  try {
    const from = (req.body?.From || req.body?.from || "email") as string;
    const postmarkAttachments: Array<{ Name: string; Content: string; ContentType: string }> =
      req.body?.Attachments || [];

    // Postmark shape
    if (Array.isArray(postmarkAttachments) && postmarkAttachments.length > 0) {
      const created: Array<{ id: number; filename: string }> = [];
      for (const att of postmarkAttachments) {
        if (!/pdf/i.test(att.ContentType) && !att.Name?.toLowerCase().endsWith(".pdf")) continue;
        const buf = Buffer.from(att.Content, "base64");
        const row = await ingestPdf(buf, att.Name || "email.pdf", from);
        if (row) created.push({ id: row.id, filename: row.storedFilename || att.Name });
      }
      return res.json({ ok: true, ingested: created.length, items: created });
    }

    // SendGrid shape (raw multipart with `attachment1`, `attachment2`, ...)
    // Requires multer to parse; falls back to advising the user.
    const files = (req as unknown as { files?: Array<{ originalname: string; buffer: Buffer; mimetype: string }> }).files;
    if (Array.isArray(files) && files.length > 0) {
      const created: Array<{ id: number; filename: string }> = [];
      for (const f of files) {
        if (!/pdf/i.test(f.mimetype) && !f.originalname?.toLowerCase().endsWith(".pdf")) continue;
        const row = await ingestPdf(f.buffer, f.originalname, from);
        if (row) created.push({ id: row.id, filename: row.storedFilename || f.originalname });
      }
      return res.json({ ok: true, ingested: created.length, items: created });
    }

    return res.status(400).json({ error: "no PDF attachments found" });
  } catch (err: any) {
    console.error("[ingest/email] error", err);
    return res.status(500).json({ error: err?.message ?? "ingest error" });
  }
}

// ─── /ingest/whatsapp ───────────────────────────────────────────────────────
// Twilio Inbound WhatsApp webhook. Sends form-urlencoded with:
//   From         — "whatsapp:+5078XXXXXXX"
//   NumMedia     — "1" (or more)
//   MediaUrl0    — https://api.twilio.com/... (requires basic auth to fetch)
//   MediaContentType0 — "application/pdf"
// We fetch the media URL with HTTP Basic auth (AccountSid:AuthToken), then
// push through the ingest pipeline. Reply with empty TwiML so Twilio doesn't
// auto-send anything back.

export async function handleWhatsappIngest(req: Request, res: Response) {
  if (!checkSecret(req)) return res.status(401).json({ error: "unauthorized" });
  if (!isStorageConfigured())
    return res.status(503).json({ error: "storage not configured" });

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return res.status(503).json({ error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured" });
  }

  try {
    const from = (req.body?.From || "whatsapp") as string;
    const numMedia = parseInt(req.body?.NumMedia || "0", 10);
    if (!numMedia) {
      res.set("Content-Type", "text/xml");
      return res.send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Envia el PDF de la factura como adjunto.</Message></Response>`,
      );
    }

    const basic = Buffer.from(`${sid}:${token}`).toString("base64");
    const created: Array<{ id: number; filename: string }> = [];

    for (let i = 0; i < numMedia; i++) {
      const url = req.body?.[`MediaUrl${i}`] as string | undefined;
      const ct = (req.body?.[`MediaContentType${i}`] as string | undefined) || "";
      if (!url) continue;
      if (!/pdf/i.test(ct)) continue; // ignore images / audio etc
      const r = await fetch(url, { headers: { Authorization: `Basic ${basic}` } });
      if (!r.ok) {
        console.warn(`[ingest/whatsapp] fetch media ${i} failed: ${r.status}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const row = await ingestPdf(buf, `whatsapp-${Date.now()}-${i}.pdf`, from);
      if (row) created.push({ id: row.id, filename: row.storedFilename || "" });
    }

    res.set("Content-Type", "text/xml");
    if (created.length > 0) {
      return res.send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>✅ ${created.length} factura(s) en el repositorio. Revisa compras.casabruja.com/repositorio-facturas</Message></Response>`,
      );
    }
    return res.send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>No encontré PDFs en el mensaje. Adjunta el archivo como PDF.</Message></Response>`,
    );
  } catch (err: any) {
    console.error("[ingest/whatsapp] error", err);
    res.set("Content-Type", "text/xml");
    return res.send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>❌ Error procesando la factura.</Message></Response>`,
    );
  }
}
