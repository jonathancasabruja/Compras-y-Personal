import express from "express";
import { createServer } from "http";
import path from "path";
import { createHmac, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./trpc";
import { handleEmailIngest, handleWhatsappIngest, handleFolderIngest } from "./ingest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_KEY = "compras" as const;
const HUB_URL = process.env.HUB_URL || "https://hub.casabruja.com";

// Timing-safe comparison so we do not leak password length via response time.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Shared JWT cookie verification (HS256) ──────────────────────────────
// Wire-compatible with the hub + facturacion. Both sign with the same
// JWT_SECRET and set the cookie on .casabruja.com so every app can decode.

function b64urlDecode(s: string): Buffer {
  let padded = s.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  return Buffer.from(padded, "base64");
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type Session = {
  openId?: string;
  name?: string;
  role?: string;
  userId?: number;
  exp?: number;
};

function verifyJWT(token: string | undefined, secret: string): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64urlEncode(createHmac("sha256", secret).update(`${h}.${p}`).digest());
  const a = Buffer.from(expected);
  const b = Buffer.from(s);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p).toString("utf-8")) as Session;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("=") ?? "");
  }
  return out;
}

/**
 * Decode cb_session_meta (base64 JSON) to get role + permissions. This
 * cookie is non-httpOnly on purpose — it's a convenience for the client
 * and for us to read without a DB round-trip. The JWT cookie is the
 * authoritative identity; meta is derived data.
 */
function readMeta(cookies: Record<string, string>): any | null {
  const raw = cookies["cb_session_meta"];
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

/** Unified auth middleware. Two acceptance paths:
 *   1. Valid JWT cookie from the hub. If the user is admin OR legacy, pass.
 *      Otherwise check permissions._apps[APP_KEY] — must not be "none".
 *   2. Legacy HTTP Basic Auth with APP_PASSWORD, preserved for bookmarks
 *      and ingest callers that haven't been migrated.
 *
 * When both fail, we bounce the browser to the hub login (same origin
 * domain, so the cookie flows back after login). API + ingest callers
 * get a plain 401.
 */
function unifiedAuth(expectedBasic: string | undefined) {
  const jwtSecret = process.env.JWT_SECRET;
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Path 1: JWT cookie
    if (jwtSecret) {
      const cookies = parseCookies(req.headers.cookie);
      const session = verifyJWT(cookies["app_session_id"], jwtSecret);
      if (session) {
        const meta = readMeta(cookies);
        // Legacy/admin cookies bypass per-app gating.
        if (meta?.legacy || meta?.role === "admin" || session.role === "admin") {
          return next();
        }
        const apps = meta?.permissions?._apps ?? {};
        const lvl = apps[APP_KEY];
        if (lvl && lvl !== "none") return next();
        // Authenticated but not entitled → 403 (not a redirect loop).
        res.status(403).type("text/html").send(
          `<!doctype html><meta charset="utf-8"><title>Sin acceso</title>
          <div style="font-family:system-ui;padding:48px;max-width:520px;margin:0 auto;color:#333">
            <h1>Sin acceso a Compras</h1>
            <p>Tu cuenta no tiene permiso para usar este módulo. Contacta al administrador para que te asigne acceso.</p>
            <p><a href="${HUB_URL}">← Volver al Hub</a></p>
          </div>`
        );
        return;
      }
    }
    // Path 2: Basic Auth
    if (expectedBasic) {
      const header = req.headers.authorization ?? "";
      if (header.startsWith("Basic ")) {
        const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
        const idx = decoded.indexOf(":");
        const providedPassword = idx >= 0 ? decoded.slice(idx + 1) : "";
        if (safeEqual(providedPassword, expectedBasic)) {
          return next();
        }
      }
    }
    // Browser → redirect to hub login. API/AJAX → 401 JSON so fetchers
    // can handle it without ending up with HTML in a JSON parser.
    const accept = req.headers.accept ?? "";
    if (accept.includes("text/html")) {
      const nextUrl = encodeURIComponent(`https://${req.headers.host}${req.originalUrl}`);
      res.redirect(302, `${HUB_URL}/login?next=${nextUrl}`);
      return;
    }
    res.set("WWW-Authenticate", 'Basic realm="Casa Bruja ERP"');
    res.status(401).send("Authentication required");
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Email inbound (Postmark/SendGrid) can send payloads up to a few MB of
  // base64 PDFs. 25 MB covers the common 10 MB limit from most providers
  // even after base64 inflation.
  app.use(express.json({ limit: "25mb" }));
  // Twilio WhatsApp posts form-urlencoded
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  // Ingestion routes go BEFORE the Basic Auth guard so Postmark/Twilio can
  // reach them without credentials. Each route validates an INGEST_SECRET
  // query/header and fails closed when the secret isn't configured.
  app.post("/ingest/email", handleEmailIngest);
  app.post("/ingest/whatsapp", handleWhatsappIngest);
  app.post("/ingest/folder", handleFolderIngest);

  const password = process.env.APP_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret && !password) {
    console.warn("Neither JWT_SECRET nor APP_PASSWORD set — server is unauthenticated");
  } else {
    console.log(
      `Auth enabled — JWT cookie: ${jwtSecret ? "yes" : "no"}, Basic Auth fallback: ${password ? "yes" : "no"}`
    );
    app.use(unifiedAuth(password));
  }

  // tRPC API — all DB operations go through here (postgres superuser via db.ts).
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
