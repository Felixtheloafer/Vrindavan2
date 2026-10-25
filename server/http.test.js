import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "./index.js";

const realFetch = globalThis.fetch;

async function start(options = {}) {
  const dataDir = options.dataDir || (await fs.mkdtemp(path.join(os.tmpdir(), "radha-http-")));
  const app = createApp({ dataDir, ...options, token: options.token ?? "" });
  await app.ensureSeeds();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const port = app.server.address().port;
  return { app, base: `http://127.0.0.1:${port}`, dataDir };
}

test("static app is served and traversal cannot escape", async () => {
  const { app, base } = await start();
  try {
    const index = await realFetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Radha/);
    assert.match(index.headers.get("content-type"), /text\/html/);
    assert.match(index.headers.get("content-security-policy"), /default-src 'self'/);
    const js = await realFetch(`${base}/assets/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type"), /javascript/);
    const traversal = await realFetch(`${base}/%2e%2e/server/index.js`);
    assert.ok([403, 404].includes(traversal.status));
    assert.doesNotMatch(await traversal.text(), /createApp/);
  } finally {
    app.server.close();
  }
});

test("access token protects API but not the static shell", async () => {
  const { app, base } = await start({ token: "top-secret-token" });
  try {
    assert.equal((await realFetch(`${base}/`)).status, 200);
    assert.equal((await realFetch(`${base}/api/health`)).status, 401);
    const authorized = await realFetch(`${base}/api/health`, {
      headers: { authorization: "Bearer top-secret-token" },
    });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).ok, true);
  } finally {
    app.server.close();
  }
});

test("config API stores a key without ever returning it", async () => {
  const { app, base, dataDir } = await start();
  try {
    const put = await realFetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auto: false,
        local: { provider: "ollama", url: "http://127.0.0.1:11434", model: "llama3.1:8b" },
        cloud: { provider: "openai", model: "gpt-4o-mini", apiKey: "sk-live-should-not-leak" },
        temperature: 0.4,
        tools: { enabled: true, fetch: true },
      }),
    });
    assert.equal(put.status, 200);
    const text = await put.text();
    assert.doesNotMatch(text, /sk-live-should-not-leak/);
    const body = JSON.parse(text);
    assert.equal(body.cloud.hasKey, true);
    assert.match(body.cloud.keyHint, /leak$/);
    const stored = JSON.parse(await fs.readFile(path.join(dataDir, "config.json"), "utf8"));
    assert.equal(stored.cloud.keys.openai, "sk-live-should-not-leak");
  } finally {
    app.server.close();
  }
});

test("memory and knowledge APIs round-trip", async () => {
  const { app, base } = await start();
  try {
    const added = await realFetch(`${base}/api/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "I like exact commands.", kind: "preference" }),
    });
    assert.equal(added.status, 201);
    const item = await added.json();
    const listed = await (await realFetch(`${base}/api/memory?q=commands`)).json();
    assert.equal(listed.items.length, 1);
    const removed = await realFetch(`${base}/api/memory/${item.id}`, { method: "DELETE" });
    assert.equal(removed.status, 200);

    const page = await realFetch(`${base}/api/knowledge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "../../v3-brain", text: "Plan before answering.", pack: "v3" }),
    });
    assert.equal(page.status, 201);
    const pageBody = await page.json();
    assert.equal(pageBody.name, "v3-brain.md");
    const pages = await (await realFetch(`${base}/api/knowledge`)).json();
    assert.equal(pages.items[0].pack, "v3");
  } finally {
    app.server.close();
  }
});

test("chat streams SSE from a mocked local Ollama", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("11434/api/tags")) return new Response("{}", { status: 200 });
    if (url.includes("11434/v1/chat/completions")) {
      const body = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Namaste"}}]}\n\n'));
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":", friend."},"finish_reason":"stop"}]}\n\n'),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return previous(input, init);
  };
  const { app, base } = await start();
  try {
    const response = await realFetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /"type":"meta"/);
    assert.match(text, /"type":"delta","text":"Namaste"/);
    assert.match(text, /"type":"done"/);
    assert.match(text, /Namaste, friend\./);
  } finally {
    app.server.close();
    globalThis.fetch = previous;
  }
});

test("chat reports a friendly SSE error when no mind is available", async () => {
  const { app, base } = await start();
  try {
    const response = await realFetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    });
    const text = await response.text();
    assert.match(text, /"type":"error"/);
    assert.match(text, /No local model answered|cloud key/);
  } finally {
    app.server.close();
  }
});

