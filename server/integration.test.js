import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "./index.js";

const realFetch = globalThis.fetch;

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.end("data: [DONE]\n\n");
}

async function startMockModel() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"models":[]}');
    }
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push(body);
      const alreadyUsedTool = body.messages.some((m) => m.role === "tool");
      if (!alreadyUsedTool && body.tools?.length) {
        sse(res, [
          { choices: [{ delta: { content: "Let me check what you keep close." } }] },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_memory_1",
                      type: "function",
                      function: { name: "memory_search", arguments: '{"query":"maroon"}' },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          },
        ]);
      } else {
        sse(res, [
          { choices: [{ delta: { content: "You prefer maroon and antique gold." } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]);
      }
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, requests, base: `http://127.0.0.1:${server.address().port}` };
}

test("local chat runs a real memory tool round-trip", async () => {
  const model = await startMockModel();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "radha-loop-"));
  const app = createApp({ dataDir, token: "" });
  await app.ensureSeeds();
  await app.stores.configs.update({
    auto: true,
    local: { provider: "ollama", url: model.base, model: "radha-test" },
    cloud: { provider: "openai", model: "gpt-4o-mini" },
    tools: { enabled: true, fetch: true },
  });
  await app.stores.memories.add("I prefer maroon and antique gold.", "preference");
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  try {
    const response = await realFetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "What colours do I like?" }] }),
    });
    const text = await response.text();
    assert.match(text, /"type":"tool","name":"memory_search","status":"running"/);
    assert.match(text, /"type":"tool","name":"memory_search","status":"done"/);
    assert.match(text, /You prefer maroon and antique gold\./);
    assert.equal(model.requests.length, 2);
    const toolMessage = model.requests[1].messages.find((m) => m.role === "tool");
    assert.ok(toolMessage);
    assert.match(toolMessage.content, /maroon/);
    assert.match(model.requests[0].messages[0].content, /What you remember/);
  } finally {
    app.server.close();
    model.server.close();
  }
});

test("auto mode falls back to cloud when the local model fails before any text", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "radha-fallback-"));
  const app = createApp({ dataDir, token: "" });
  await app.ensureSeeds();
  await app.stores.configs.update({
    auto: true,
    local: { provider: "ollama", url: "http://127.0.0.1:11434", model: "missing-model" },
    cloud: { provider: "openai", model: "gpt-4o-mini", apiKey: "sk-test" },
    tools: { enabled: false, fetch: false },
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("11434/api/tags")) return new Response("{}", { status: 200 });
    if (url.includes("11434/v1/chat/completions")) return new Response("model not found", { status: 404 });
    if (url.includes("api.openai.com/v1/chat/completions")) {
      const body = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Cloud answer."},"finish_reason":"stop"}]}\n\n'));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return new Response("not found", { status: 404 });
  };
  try {
    const response = await realFetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    });
    const text = await response.text();
    assert.match(text, /continuing with your cloud mind/);
    assert.match(text, /Cloud answer\./);
    assert.match(text, /"provider":"openai"/);
  } finally {
    globalThis.fetch = realFetch;
    app.server.close();
  }
});
