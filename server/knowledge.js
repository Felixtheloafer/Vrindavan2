import { promises as fs } from "node:fs";
import path from "node:path";

const PACKS = new Set(["v3", "v9", "general"]);
const MAX_BYTES = 600_000;
const CONTEXT_BUDGET = 24_000;

export function sanitizeFileName(raw) {
  let name = path.basename(String(raw || "note.md")).normalize("NFKD");
  name = name
    .replace(/[^\w.\- ]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-]+/, "")
    .slice(0, 100);
  if (!name) name = "note";
  if (!/\.(md|txt)$/i.test(name)) name += ".md";
  name = name.replace(/\.(txt)$/i, ".md");
  return name;
}

export function createKnowledgeStore(dataDir) {
  const dir = path.join(dataDir, "knowledge");
  const indexPath = path.join(dir, "index.json");
  let queue = Promise.resolve();

  function serialise(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  async function readIndex() {
    try {
      const raw = JSON.parse(await fs.readFile(indexPath, "utf8"));
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }

  async function writeIndex(index) {
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${indexPath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tmp, indexPath);
  }

  async function list() {
    let files = [];
    try {
      files = (await fs.readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name) && !entry.name.startsWith("."))
        .map((entry) => entry.name);
    } catch {
      return [];
    }
    const index = await readIndex();
    const items = [];
    for (const name of files) {
      const stat = await fs.stat(path.join(dir, name));
      const meta = index[name] || {};
      items.push({
        name,
        pack: PACKS.has(meta.pack) ? meta.pack : name.split("__")[0] === "v3" ? "v3" : name.split("__")[0] === "v9" ? "v9" : "general",
        size: stat.size,
        updatedAt: meta.updatedAt || stat.mtime.toISOString(),
      });
    }
    return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function add(name, text, pack = "general") {
    const clean = String(text || "").trim();
    if (!clean) throw Object.assign(new Error("Knowledge text is required."), { status: 400 });
    if (Buffer.byteLength(clean) > MAX_BYTES) throw Object.assign(new Error("That page is too large (600 KB max)."), { status: 413 });
    const safe = sanitizeFileName(name);
    const safePack = PACKS.has(pack) ? pack : "general";
    return serialise(async () => {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, safe), clean, { mode: 0o600 });
      const index = await readIndex();
      index[safe] = { pack: safePack, updatedAt: new Date().toISOString() };
      await writeIndex(index);
      return { name: safe, pack: safePack, size: Buffer.byteLength(clean), updatedAt: index[safe].updatedAt };
    });
  }

  async function remove(name) {
    const safe = sanitizeFileName(name);
    return serialise(async () => {
      try {
        await fs.unlink(path.join(dir, safe));
      } catch {
        throw Object.assign(new Error("Knowledge page not found."), { status: 404 });
      }
      const index = await readIndex();
      delete index[safe];
      await writeIndex(index);
      return { ok: true };
    });
  }

  async function readItem(name) {
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      if (raw.includes("\u0000")) return "";
      return raw.slice(0, MAX_BYTES);
    } catch {
      return "";
    }
  }

  function relevant(text, query) {
    if (!query) return 0;
    const haystack = text.toLowerCase();
    let score = 0;
    for (const token of query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)) {
      let at = 0;
      let found = 0;
      while (found < 4) {
        at = haystack.indexOf(token, at);
        if (at < 0) break;
        found++;
        at += token.length;
      }
      score += found;
    }
    return score;
  }

  async function context(query = "", mode = "chat") {
    const items = await list();
    if (!items.length) return "";
    const scored = [];
    for (const item of items) {
      const text = await readItem(item.name);
      if (!text) continue;
      let score = relevant(text, query);
      if (mode === "studio" && item.pack === "v9") score += 3;
      if (item.pack !== "general") score += 0.25;
      scored.push({ ...item, text, score });
    }
    scored.sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    let budget = CONTEXT_BUDGET;
    const sections = [];
    for (const item of scored) {
      if (budget <= 0) break;
      const body = item.text.slice(0, Math.min(8000, budget));
      budget -= body.length;
      sections.push(`### ${item.name} [${item.pack}]\n${body}`);
    }
    return sections.length ? sections.join("\n\n") : "";
  }

  async function exportAll() {
    const items = await list();
    return Promise.all(items.map(async (item) => ({ ...item, text: await readItem(item.name) })));
  }

  return { dir, list, add, remove, context, exportAll };
}
