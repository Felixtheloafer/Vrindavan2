import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const KINDS = new Set(["fact", "preference", "project", "promise"]);
const MAX_ENTRIES = 1000;
const MAX_TEXT = 20000;

export function createMemoryStore(dataDir) {
  const file = path.join(dataDir, "memory.jsonl");
  let queue = Promise.resolve();

  function serialise(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  async function all() {
    try {
      const raw = await fs.readFile(file, "utf8");
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            const item = JSON.parse(line);
            return item && item.id && item.text ? item : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function score(item, query) {
    if (!query) return 0;
    const haystack = `${item.text} ${item.kind}`.toLowerCase();
    const q = query.toLowerCase().trim();
    let value = haystack.includes(q) ? 8 : 0;
    for (const token of q.split(/\s+/).filter((t) => t.length > 2)) {
      if (haystack.includes(token)) value += 2;
    }
    return value;
  }

  async function search(query = "", limit = 100) {
    const items = await all();
    const q = String(query || "").slice(0, 500);
    return items
      .map((item) => ({ item, score: score(item, q) }))
      .filter((entry) => !q || entry.score > 0)
      .sort((a, b) => b.score - a.score || String(b.item.createdAt).localeCompare(String(a.item.createdAt)))
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  async function add(text, kind = "fact") {
    const clean = String(text || "").trim();
    if (!clean) throw Object.assign(new Error("Memory text is required."), { status: 400 });
    if (clean.length > MAX_TEXT) throw Object.assign(new Error("That memory is too long (20,000 characters max)."), { status: 400 });
    const safeKind = KINDS.has(kind) ? kind : "fact";
    return serialise(async () => {
      const item = { id: randomUUID(), text: clean, kind: safeKind, createdAt: new Date().toISOString() };
      await fs.mkdir(dataDir, { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(item)}\n`, { mode: 0o600 });
      const current = await all();
      if (current.length > MAX_ENTRIES) {
        const kept = current.slice(-MAX_ENTRIES);
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, kept.map((entry) => JSON.stringify(entry)).join("\n") + "\n", { mode: 0o600 });
        await fs.rename(tmp, file);
      }
      return item;
    });
  }

  async function remove(id) {
    if (!id) throw Object.assign(new Error("A memory id is required."), { status: 400 });
    return serialise(async () => {
      const items = await all();
      const filtered = items.filter((item) => item.id !== id);
      if (filtered.length === items.length) throw Object.assign(new Error("Memory not found."), { status: 404 });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, filtered.map((entry) => JSON.stringify(entry)).join("\n") + (filtered.length ? "\n" : ""), { mode: 0o600 });
      await fs.rename(tmp, file);
      return { ok: true };
    });
  }

  async function retrieve(query, limit = 8) {
    const matches = await search(query, limit);
    if (matches.length >= Math.min(3, limit)) return matches;
    const items = await all();
    const seen = new Set(matches.map((m) => m.id));
    for (const item of items.slice(-limit).reverse()) {
      if (!seen.has(item.id)) {
        matches.push(item);
        seen.add(item.id);
      }
      if (matches.length >= limit) break;
    }
    return matches.slice(0, limit);
  }

  return { file, all, search, add, remove, retrieve };
}
