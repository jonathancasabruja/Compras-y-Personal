import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Timing-safe comparison so we do not leak password length via response time.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function basicAuth(expectedPassword: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const header = req.headers.authorization ?? "";
    if (header.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
      const idx = decoded.indexOf(":");
      const providedPassword = idx >= 0 ? decoded.slice(idx + 1) : "";
      if (safeEqual(providedPassword, expectedPassword)) {
        return next();
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="Casa Bruja ERP"');
    res.status(401).send("Authentication required");
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  const password = process.env.APP_PASSWORD;
  if (password) {
    console.log("APP_PASSWORD set — enabling HTTP Basic Auth");
    app.use(basicAuth(password));
  } else {
    console.warn("APP_PASSWORD not set — server is unauthenticated");
  }

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
