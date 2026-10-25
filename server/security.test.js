import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createConfigStore } from "./config.js";
import { createMemoryStore } from "./memory.js";
import { createKnowledgeStore, sanitizeFileName } from "./knowledge.js";
import { createToolbox, isPrivateAddress } from "./tools.js";

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "radha-test-"));
}

test("config is redacted and validates temperature", async () => {
  const dir = await tempDir();
  const store = createConfigStore(dir);
  const updated = await store.update({ cloud: { provider: "openai", model: "gpt-4o-mini", apiKey: "sk-test-secret-1234" }, temperature: 0.3 });
  assert.equal(updated.cloud.keys.openai, "sk-test-secret-1234");
  const redacted = store.redact(updated);
  assert.equal(redacted.cloud.hasKey, true);
  assert.equal(redacted.cloud.apiKey, undefined);
  assert.ok(!JSON.stringify(redacted).includes("sk-test-secret"));
  assert.match(redacted.cloud.keyHint, /1234$/);
  const mode = (await fs.stat(path.join(dir, "config.json"))).mode & 0o777;
  assert.equal(mode, 0o600);
  await assert.rejects(() => store.update({ temperature: 9 }), /between 0 and 2/);
  await assert.rejects(() => store.update({ local: { url: "file:///etc/passwd" } }), /valid http/);
});

test("memory can be added, searched, retrieved and removed", async () => {
  const dir = await tempDir();
  const store = createMemoryStore(dir);
  const one = await store.add("I prefer maroon and antique gold.", "preference");
  await store.add("My project is called Vrindavan.", "project");
  const found = await store.search("maroon");
  assert.equal(found.length, 1);
  assert.equal(found[0].id, one.id);
  assert.ok((await store.retrieve("unrelated query", 5)).length >= 2);
  await store.remove(one.id);
  assert.equal((await store.search("maroon")).length, 0);
  await assert.rejects(() => store.add("   "), /required/);
});

test("knowledge filenames cannot escape the knowledge directory", async () => {
  const dir = await tempDir();
  const store = createKnowledgeStore(dir);
  assert.equal(sanitizeFileName("../../etc/passwd"), "passwd.md");
  assert.equal(sanitizeFileName("..\\..\\secret"), "secret.md");
  assert.equal(sanitizeFileName("a/b/c.md"), "c.md");
  const item = await store.add("../../evil", "do not escape", "v9");
  assert.equal(item.name, "evil.md");
  const files = await fs.readdir(path.join(dir, "knowledge"));
  assert.deepEqual(files.sort(), ["evil.md", "index.json"]);
  const ctx = await store.context("escape", "studio");
  assert.match(ctx, /do not escape/);
  await store.remove(item.name);
  await assert.rejects(() => store.remove(item.name), /not found/);
});

test("workspace tools refuse traversal and private addresses", async () => {
  const dir = await tempDir();
  const memory = createMemoryStore(dir);
  const tools = createToolbox(dir, { memory });
  await tools.write("notes/hello.md", "hello Radha");
  assert.match(await tools.read("notes/hello.md"), /hello Radha/);
  assert.match(await tools.list(""), /notes\/hello\.md/);
  await assert.rejects(() => tools.read("../../etc/passwd"), /traversal|escapes/);
  await assert.rejects(() => tools.write("/tmp/evil", "x"), /relative/);
  await assert.rejects(() => tools.webFetch("http://127.0.0.1:8787/api/health", { tools: { fetch: true } }), /refused/);
  await assert.rejects(() => tools.webFetch("http://localhost/", { tools: { fetch: true } }), /refused/);
  assert.equal(isPrivateAddress("10.1.2.3"), true);
  assert.equal(isPrivateAddress("172.16.0.1"), true);
  assert.equal(isPrivateAddress("172.32.0.1"), false);
  assert.equal(isPrivateAddress("192.168.1.1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("fe80::1"), true);
});
