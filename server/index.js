import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createConfigStore, isLoopbackHost } from "./config.js";
import { createMemoryStore } from "./memory.js";
import { createKnowledgeStore } from "./knowledge.js";
import { createToolbox } from "./tools.js";
import { cloudConfigured, localHealth, streamCompletion } from "./providers.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function securityHeaders(extra = {}) {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), geolocation=(), microphone=(self)",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ...extra,
  };
}

function json(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders({
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
      "cache-control": "no-store",
      ...extra,
    }),
  });
  res.end(payload);
}

function errorStatus(error) {
  return Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
}

async function readJson(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function tokenMatches(expected, provided) {
  if (!expected) return true;
  if (!provided) return false;
  const a = crypto.createHash("sha256").update(String(expected)).digest();
  const b = crypto.createHash("sha256").update(String(provided)).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.AGENT_DATA_DIR || path.join(ROOT, "data"));
  const agentDir = path.resolve(options.agentDir || path.join(ROOT, "agent"));
  const token = options.token ?? process.env.AGENT_ACCESS_TOKEN ?? "";
  const configs = createConfigStore(dataDir);
  const memories = createMemoryStore(dataDir);
  const knowledge = createKnowledgeStore(dataDir);
  const tools = createToolbox(dataDir, { memory: memories });
  let healthCache = { at: 0, value: null };

  async function ensureSeeds() {
    await fs.mkdir(path.join(dataDir, "workspace"), { recursive: true });
    await fs.mkdir(path.join(dataDir, "knowledge"), { recursive: true });
    await fs
      .writeFile(
        path.join(dataDir, "workspace", "README.md"),
        "# Radha's workspace\n\nThis is the only folder her file tools may read or write. Drop notes, drafts and references here. Everything stays on this machine.\n",
        { flag: "wx", mode: 0o600 },
      )
      .catch(() => {});
    await fs
      .writeFile(
        path.join(dataDir, "knowledge", "README.md"),
        "# Knowledge\n\nImport private Phani V3 (AI Brain) and V9 (AI Video) exports in the app. Pages are indexed locally.\n",
        { flag: "wx", mode: 0o600 },
      )
      .catch(() => {});
  }

  async function getPersona() {
    try {
      return await fs.readFile(path.join(dataDir, "persona.md"), "utf8");
    } catch {
      try {
        return await fs.readFile(path.join(HERE, "persona.md"), "utf8");
      } catch {
        return "You are Radha, a warm, sharp, local-first AI companion. Be honest that you are an AI.";
      }
    }
  }

  async function savePersona(text) {
    if (typeof text !== "string" || !text.trim()) {
      const error = new Error("Persona text is required.");
      error.status = 400;
      throw error;
    }
    if (text.length > 50000) {
      const error = new Error("Persona is too long (50,000 characters max).");
      error.status = 413;
      throw error;
    }
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, "persona.md"), text, { mode: 0o600 });
  }

  async function getHealth(force = false) {
    if (!force && healthCache.value && Date.now() - healthCache.at < 10_000) return healthCache.value;
    const config = await configs.read();
    const local = await localHealth(config);
    const value = {
      ok: true,
      version: "1.0.0",
      local,
      cloudConfigured: cloudConfigured(config),
      auth: Boolean(token),
      uptime: Math.round(process.uptime()),
    };
    healthCache = { at: Date.now(), value };
    return value;
  }

  async function serveStatic(req, res, pathname) {
    let relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    try {
      relative = decodeURIComponent(relative);
    } catch {
      return json(res, 400, { error: "Bad path." });
    }
    if (relative.includes("\u0000")) return json(res, 400, { error: "Bad path." });
    const target = path.resolve(agentDir, relative);
    if (target !== agentDir && !target.startsWith(`${agentDir}${path.sep}`)) {
      return json(res, 403, { error: "Forbidden." });
    }
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error("not a file");
      const type = MIME[path.extname(target).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, securityHeaders({ "content-type": type, "cache-control": "no-cache" }));
      if (req.method === "HEAD") return res.end();
      res.end(await fs.readFile(target));
    } catch {
      json(res, 404, { error: "Not found." });
    }
  }


  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const pathname = url.pathname;

      if (!pathname.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(req.method)) return json(res, 405, { error: "Method not allowed." });
        if (pathname === "/favicon.ico") return await serveStatic(req, res, "/assets/favicon.svg");
        return await serveStatic(req, res, pathname);
      }

      if (token) {
        const header = req.headers.authorization || "";
        const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        if (!tokenMatches(token, provided)) {
          return json(res, 401, { error: "Access token required. Enter the AGENT_ACCESS_TOKEN configured on the server." });
        }
      }

      if (pathname === "/api/health" && req.method === "GET") {
        return json(res, 200, await getHealth());
      }

      if (pathname === "/api/config" && req.method === "GET") {
        return json(res, 200, configs.redact(await configs.read()));
      }

      if (pathname === "/api/config" && req.method === "PUT") {
        const body = await readJson(req);
        const updated = await configs.update(body);
        healthCache = { at: 0, value: null };
        return json(res, 200, configs.redact(updated));
      }

      if (pathname === "/api/memory" && req.method === "GET") {
        const items = await memories.search(url.searchParams.get("q") || "", 200);
        return json(res, 200, { items });
      }

      if (pathname === "/api/memory" && req.method === "POST") {
        const body = await readJson(req);
        const item = await memories.add(body.text, body.kind);
        return json(res, 201, item);
      }

      const memoryMatch = pathname.match(/^\/api\/memory\/([^/]+)$/);
      if (memoryMatch && req.method === "DELETE") {
        return json(res, 200, await memories.remove(decodeURIComponent(memoryMatch[1])));
      }

      if (pathname === "/api/knowledge" && req.method === "GET") {
        return json(res, 200, { items: await knowledge.list() });
      }

      if (pathname === "/api/knowledge" && req.method === "POST") {
        const body = await readJson(req);
        const item = await knowledge.add(body.name, body.text, body.pack);
        return json(res, 201, item);
      }

      const knowledgeMatch = pathname.match(/^\/api\/knowledge\/([^/]+)$/);
      if (knowledgeMatch && req.method === "DELETE") {
        return json(res, 200, await knowledge.remove(decodeURIComponent(knowledgeMatch[1])));
      }

      if (pathname === "/api/persona" && req.method === "GET") {
        return json(res, 200, { text: await getPersona() });
      }

      if (pathname === "/api/persona" && req.method === "PUT") {
        const body = await readJson(req);
        await savePersona(body.text);
        return json(res, 200, { ok: true });
      }

      if (pathname === "/api/export" && req.method === "GET") {
        const config = configs.redact(await configs.read());
        const bundle = {
          exportedAt: new Date().toISOString(),
          version: "1.0.0",
          persona: await getPersona(),
          memory: await memories.all(),
          knowledge: await knowledge.exportAll(),
          config,
          workspace: await tools.list("").catch(() => ""),
        };
        const payload = JSON.stringify(bundle, null, 2);
        res.writeHead(200, {
          ...securityHeaders({
            "content-type": "application/json; charset=utf-8",
            "content-disposition": `attachment; filename="radha-export-${new Date().toISOString().slice(0, 10)}.json"`,
            "cache-control": "no-store",
            "content-length": Buffer.byteLength(payload),
          }),
        });
        return res.end(payload);
      }


      if ((pathname === "/api/chat" || pathname === "/api/studio") && req.method === "POST") {
        const body = await readJson(req);
        if (!Array.isArray(body.messages)) return json(res, 400, { error: "messages must be an array." });
        if (body.model !== undefined && (typeof body.model !== "string" || body.model.length > 200)) {
          return json(res, 400, { error: "model must be a short string." });
        }
        const mode = pathname === "/api/studio" ? "studio" : ["chat", "studio"].includes(body.mode) ? body.mode : "chat";
        const persona = await getPersona();
        const lastUser = [...body.messages].reverse().find((m) => m?.role === "user" && typeof m.content === "string");
        const query = lastUser?.content?.slice(0, 1500) || "";
        const [memoryItems, knowledgeText, config] = await Promise.all([
          memories.retrieve(query, 8),
          knowledge.context(query, mode),
          configs.read(),
        ]);

        res.writeHead(200, {
          ...securityHeaders({
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          }),
        });
        res.flushHeaders?.();
        res.socket?.setNoDelay(true);

        let closed = false;
        const controller = new AbortController();
        res.on("close", () => {
          if (!res.writableEnded) {
            closed = true;
            controller.abort();
          }
        });
        const emit = (event) => {
          if (!closed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
        };
        const heartbeat = setInterval(() => {
          if (!closed && !res.writableEnded) res.write(": ping\n\n");
        }, 15_000);

        try {
          const result = await streamCompletion({
            messages: body.messages,
            config,
            persona,
            memories: memoryItems,
            knowledge: knowledgeText,
            tools,
            mode,
            model: body.model,
            provider: body.provider,
            signal: controller.signal,
            emit,
          });
          emit({ type: "done", content: result.content, provider: result.provider, model: result.model });
        } catch (error) {
          if (error?.name !== "AbortError" && !closed) {
            emit({ type: "error", error: error.message || "The model stream failed." });
          }
        } finally {
          clearInterval(heartbeat);
          if (!res.writableEnded) res.end();
        }
        return;
      }

      return json(res, 404, { error: "Not found." });
    } catch (error) {
      if (!res.headersSent) {
        json(res, errorStatus(error), { error: error.message || "Request failed." });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  server.requestTimeout = 0;
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 72_000;

  return { server, stores: { configs, memories, knowledge, tools }, ensureSeeds, getHealth, dataDir, agentDir };
}

export function createServer(options = {}) {
  return createApp(options).server;
}

export async function start() {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT must be a number between 1 and 65535.");
    process.exit(1);
  }
  if (!isLoopbackHost(host) && !process.env.AGENT_ACCESS_TOKEN) {
    console.error("Refusing to listen beyond localhost without AGENT_ACCESS_TOKEN.");
    console.error("Example: HOST=0.0.0.0 AGENT_ACCESS_TOKEN='a-long-secret' npm run agent");
    process.exit(1);
  }
  const app = createApp();
  await app.ensureSeeds();
  app.server.listen(port, host, () => {
    const display = isLoopbackHost(host) ? "127.0.0.1" : host;
    console.log(`\n  Radha is awake at http://${display}:${port}\n`);
    console.log(`  Data:       ${app.dataDir}`);
    console.log(`  Local mind: ${process.env.OLLAMA_URL || "configure Ollama or LM Studio in Settings"}`);
    console.log(`  Cloud key:  ${process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY ? "environment key detected" : "not set (optional)"}`);
    console.log(`  Security:   ${process.env.AGENT_ACCESS_TOKEN ? "access token required" : "loopback only"}\n`);
  });
  app.server.on("error", (error) => {
    if (error.code === "EADDRINUSE") console.error(`Port ${port} is already in use. Try PORT=8788 npm run agent.`);
    else console.error(error.message);
    process.exit(1);
  });
  return app.server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) start();

