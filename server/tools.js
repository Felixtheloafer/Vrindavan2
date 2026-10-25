import { promises as fs } from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_WRITE = 300_000;
const MAX_READ = 300_000;
const MAX_FETCH = 1_200_000;

export class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolError";
  }
}

export function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    if (lower.startsWith("ff")) return true;
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice(7);
      if (net.isIP(mapped) === 4) return isPrivateAddress(mapped);
    }
    return false;
  }
  return true;
}

export function createToolbox(dataDir, { memory } = {}) {
  const root = path.join(dataDir, "workspace");

  async function ensureRoot() {
    await fs.mkdir(root, { recursive: true });
    return fs.realpath(root);
  }

  function candidate(relative) {
    const raw = String(relative ?? "").trim();
    if (!raw || raw === ".") return root;
    if (raw.includes("\u0000") || raw.startsWith("/") || raw.startsWith("\\") || /^[A-Za-z]:/.test(raw)) {
      throw new ToolError("Path must be relative to the workspace.");
    }
    const normal = raw.replace(/\\/g, "/");
    if (normal.split("/").some((part) => part === "..")) throw new ToolError("Path traversal is not allowed.");
    const target = path.resolve(root, normal);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new ToolError("Path escapes the workspace.");
    return target;
  }

  async function checked(relative, { mustExist = false } = {}) {
    const target = candidate(relative);
    const realRoot = await ensureRoot();
    if (mustExist) {
      const real = await fs.realpath(target);
      if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) throw new ToolError("Path escapes the workspace.");
      return real;
    }
    const parent = path.dirname(target);
    await fs.mkdir(parent, { recursive: true });
    const realParent = await fs.realpath(parent);
    if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${path.sep}`)) {
      throw new ToolError("Path escapes the workspace.");
    }
    return path.join(realParent, path.basename(target));
  }

  async function list(relative = "", depth = 0) {
    const start = await checked(relative || ".", { mustExist: true });
    const stat = await fs.stat(start);
    if (!stat.isDirectory()) throw new ToolError("That path is not a directory.");
    const results = [];
    async function walk(dir, level) {
      if (level > 3 || results.length >= 200) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= 200) break;
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full).split(path.sep).join("/");
        if (entry.isDirectory()) {
          results.push(`${rel}/`);
          if (level < 3) await walk(full, level + 1);
        } else if (entry.isFile()) {
          const info = await fs.stat(full);
          results.push(`${rel} (${info.size} bytes)`);
        }
      }
    }
    await walk(start, depth);
    return results.join("\n") || "(the workspace is empty)";
  }

  async function read(relative) {
    const target = await checked(relative, { mustExist: true });
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new ToolError("That path is not a file.");
    if (stat.size > MAX_READ) throw new ToolError("That file is too large to read (300 KB max).");
    const buffer = await fs.readFile(target);
    if (buffer.includes(0)) throw new ToolError("That looks like a binary file.");
    return buffer.toString("utf8");
  }

  async function write(relative, content) {
    const text = String(content ?? "");
    if (Buffer.byteLength(text) > MAX_WRITE) throw new ToolError("That file is too large to write (300 KB max).");
    const target = await checked(relative);
    try {
      const existing = await fs.lstat(target);
      if (existing.isSymbolicLink()) throw new ToolError("Refusing to write through a symlink.");
      if (existing.isDirectory()) throw new ToolError("That path is a directory.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.writeFile(target, text, { mode: 0o600 });
    return `Wrote ${Buffer.byteLength(text)} bytes to ${path.relative(root, target)}.`;
  }

  async function search(query) {
    const needle = String(query || "").trim();
    if (!needle) throw new ToolError("A search query is required.");
    const matches = [];
    let files = 0;
    async function walk(dir, level) {
      if (level > 3 || matches.length >= 60 || files >= 300) return;
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (matches.length >= 60 || files >= 300) break;
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full, level + 1);
        else if (entry.isFile()) {
          files++;
          const stat = await fs.stat(full);
          if (stat.size > 200_000) continue;
          const text = await fs.readFile(full, "utf8").catch(() => "");
          if (text.includes("\u0000")) continue;
          const lines = text.split("\n");
          lines.forEach((line, index) => {
            if (matches.length < 60 && line.toLowerCase().includes(needle.toLowerCase())) {
              matches.push(`${path.relative(root, full).split(path.sep).join("/")}:${index + 1}: ${line.trim().slice(0, 240)}`);
            }
          });
        }
      }
    }
    await walk(root, 0);
    return matches.length ? matches.join("\n") : "No matches.";
  }

  async function validatePublicUrl(raw) {
    let url;
    try {
      url = new URL(String(raw));
    } catch {
      throw new ToolError("That is not a valid URL.");
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new ToolError("Only http and https URLs are allowed.");
    if (url.username || url.password) throw new ToolError("URLs with credentials are not allowed.");
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      throw new ToolError("Private and local addresses are refused.");
    }
    if (net.isIP(hostname)) {
      if (isPrivateAddress(hostname)) throw new ToolError("Private and local addresses are refused.");
    } else {
      let records = [];
      try {
        records = await dns.lookup(hostname, { all: true });
      } catch {
        throw new ToolError("That host could not be resolved.");
      }
      if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
        throw new ToolError("Private and local addresses are refused.");
      }
    }
    return url;
  }

  function htmlToText(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function readBody(response) {
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared && declared > MAX_FETCH) throw new ToolError("The page is too large to read.");
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FETCH) {
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  async function webFetch(raw, config) {
    if (!config?.tools?.fetch) throw new ToolError("Network fetch is disabled in Settings.");
    let url = await validatePublicUrl(raw);
    for (let hop = 0; hop < 4; hop++) {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: { "user-agent": "RadhaAgent/1.0 (local research)", accept: "text/html,text/plain,application/json;q=0.8" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new ToolError("The page redirected without a destination.");
        url = await validatePublicUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new ToolError(`The page returned HTTP ${response.status}.`);
      const type = response.headers.get("content-type") || "";
      if (!/text\/|json|xml|javascript/i.test(type)) throw new ToolError(`Unsupported content type: ${type || "unknown"}.`);
      const body = await readBody(response);
      const text = /html/i.test(type) ? htmlToText(body) : body;
      return `${url.toString()}\n\n${text.slice(0, 10_000)}`;
    }
    throw new ToolError("Too many redirects.");
  }


  const definitions = [
    {
      type: "function",
      function: {
        name: "memory_search",
        description: "Search Radha's long-term memory for facts, preferences, projects and promises.",
        parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      },
    },
    {
      type: "function",
      function: {
        name: "memory_add",
        description: "Keep a durable fact or preference in long-term memory. Use only for information worth remembering later.",
        parameters: {
          type: "object",
          properties: { text: { type: "string" }, kind: { type: "string", enum: ["fact", "preference", "project", "promise"] } },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "workspace_list",
        description: "List files in the user's local workspace. Paths are relative.",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    },
    {
      type: "function",
      function: {
        name: "workspace_read",
        description: "Read a UTF-8 text file from the local workspace.",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    },
    {
      type: "function",
      function: {
        name: "workspace_write",
        description: "Create or replace a text file inside the local workspace.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "workspace_search",
        description: "Search text files in the local workspace.",
        parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      },
    },
    {
      type: "function",
      function: {
        name: "web_fetch",
        description: "Fetch and read a public web page. Private and local addresses are refused.",
        parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
      },
    },
    {
      type: "function",
      function: {
        name: "clock",
        description: "Get the current local date and time.",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  async function execute(name, args = {}, config = { tools: { enabled: true, fetch: true } }) {
    if (!config.tools?.enabled) throw new ToolError("Tools are disabled in Settings.");
    const input = args && typeof args === "object" ? args : {};
    switch (name) {
      case "memory_search":
        if (!memory) throw new ToolError("Memory is unavailable.");
        return JSON.stringify(await memory.search(String(input.query || ""), 12));
      case "memory_add":
        if (!memory) throw new ToolError("Memory is unavailable.");
        return JSON.stringify(await memory.add(input.text, input.kind));
      case "workspace_list":
        return list(input.path || "");
      case "workspace_read":
        return read(input.path);
      case "workspace_write":
        return write(input.path, input.content);
      case "workspace_search":
        return search(input.query);
      case "web_fetch":
        return webFetch(input.url, config);
      case "clock":
        return new Date().toString();
      default:
        throw new ToolError(`Unknown tool: ${name}`);
    }
  }

  return { root, definitions, execute, list, read, write, search, webFetch, validatePublicUrl, isPrivateAddress, checked };
}

