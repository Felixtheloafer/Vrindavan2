import { CLOUD_PROVIDERS, LOCAL_PROVIDERS, PROVIDERS, envKey } from "./config.js";

const CLOUD_BASE = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

const LOCAL_DEFAULT = { ollama: "http://127.0.0.1:11434", lmstudio: "http://127.0.0.1:1234", llamacpp: "http://127.0.0.1:8080" };

export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function timeout(ms) {
  return AbortSignal.timeout(ms);
}

async function probe(url, ms = 900) {
  try {
    const response = await fetch(url, { signal: timeout(ms) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function localHealth(config) {
  const provider = config.local?.provider || "ollama";
  const configured = config.local?.url || LOCAL_DEFAULT[provider];
  const urls = {
    ollama: provider === "ollama" ? configured : LOCAL_DEFAULT.ollama,
    lmstudio: provider === "lmstudio" ? configured : LOCAL_DEFAULT.lmstudio,
    llamacpp: provider === "llamacpp" ? configured : LOCAL_DEFAULT.llamacpp,
  };
  const [ollama, lmstudio, llamacpp] = await Promise.all([
    probe(`${urls.ollama.replace(/\/+$/, "")}/api/tags`),
    probe(`${urls.lmstudio.replace(/\/+$/, "")}/v1/models`),
    probe(`${urls.llamacpp.replace(/\/+$/, "")}/v1/models`),
  ]);
  return { ollama, lmstudio, llamacpp };
}

export function providerKey(config, provider = config.cloud?.provider) {
  return config.cloud?.keys?.[provider] || config.cloud?.apiKey || envKey(provider);
}

export function cloudConfigured(config) {
  const list = [];
  const current = config.cloud?.provider;
  if (current && providerKey(config, current)) list.push(current);
  for (const provider of CLOUD_PROVIDERS) if (envKey(provider) && !list.includes(provider)) list.push(provider);
  return list;
}

function openAiBase(provider, base) {
  if (provider === "openai" || provider === "openrouter" || provider === "groq") return CLOUD_BASE[provider];
  const trimmed = String(base || LOCAL_DEFAULT[provider] || "").replace(/\/+$/, "");
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

async function localReachable(config) {
  const provider = config.local?.provider || "ollama";
  const base = (config.local?.url || LOCAL_DEFAULT[provider]).replace(/\/+$/, "");
  const path = provider === "ollama" ? "/api/tags" : "/v1/models";
  return probe(`${base}${path}`, 1200);
}

export async function chooseRoute(config, options = {}) {
  if (options.provider) {
    const provider = options.provider;
    if (!PROVIDERS.includes(provider)) throw new ProviderError("Unknown provider.", 400);
    if (LOCAL_PROVIDERS.includes(provider)) {
      return { kind: "local", provider, model: options.model || config.local.model, base: config.local.url, key: "" };
    }
    return {
      kind: "cloud",
      provider,
      model: options.model || config.cloud.model,
      base: CLOUD_BASE[provider],
      key: providerKey(config, provider),
    };
  }
  const key = providerKey(config);
  if (config.auto) {
    if (await localReachable(config)) {
      return { kind: "local", provider: config.local.provider, model: options.model || config.local.model, base: config.local.url, key: "" };
    }
    if (key) {
      return { kind: "cloud", provider: config.cloud.provider, model: options.model || config.cloud.model, base: CLOUD_BASE[config.cloud.provider], key };
    }
    throw new ProviderError(
      "No local model answered and no cloud key is configured. Start Ollama (ollama serve) or add a cloud key in Settings.",
      503,
    );
  }
  if (key) {
    return { kind: "cloud", provider: config.cloud.provider, model: options.model || config.cloud.model, base: CLOUD_BASE[config.cloud.provider], key };
  }
  return { kind: "local", provider: config.local.provider, model: options.model || config.local.model, base: config.local.url, key: "" };
}

export function buildSystem({ persona, memories = [], knowledge = "", mode = "chat", toolsEnabled = true }) {
  const now = new Date();
  const memoryText = memories.length
    ? memories.map((m) => `- [${m.kind || "fact"}] ${m.text}`).join("\n")
    : "(nothing kept yet)";
  const modeNote =
    mode === "studio"
      ? "You are in Studio mode. Produce a production-ready film treatment: logline, directing concept, timed script, shot list (lens, movement, light, sound), generation prompts and an edit note. Prefer the V9 knowledge pack when it is relevant."
      : "Answer the request directly. If a tool would materially improve accuracy, use it. Do not use tools for decoration.";
  return `${persona}

## Operating context
Current date: ${now.toDateString()}, ${now.toTimeString()}.
You are running inside Radha, a local-first agent. You are an AI, not a human. Never claim to have read private links or files you have not actually retrieved. If an import is missing, say so and explain how to add it.

## What you remember about this person
${memoryText}

## Curated knowledge
${knowledge || "(no imported pages yet)"}

## Tool discipline
${toolsEnabled ? "You have tools for memory, the local workspace, public web pages, and the clock. Use them only when needed. Never invent file contents or fetched pages. Workspace paths are relative. You cannot run shell commands." : "Tools are disabled. Answer from the conversation and knowledge above, and say what you cannot verify."}

${modeNote}`;
}

export function prepareMessages(messages) {
  if (!Array.isArray(messages)) throw new ProviderError("messages must be an array.", 400);
  const cleaned = [];
  let total = 0;
  for (const message of messages.slice(-30)) {
    if (!message || !["user", "assistant"].includes(message.role)) continue;
    const content = typeof message.content === "string" ? message.content : "";
    if (!content.trim()) continue;
    if (content.length > 30000) throw new ProviderError("A message is too long.", 413);
    total += content.length;
    if (total > 120000) break;
    cleaned.push({ role: message.role, content });
  }
  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") {
    throw new ProviderError("A user message is required.", 400);
  }
  return cleaned;
}

async function* lines(response) {
  if (!response.body) throw new ProviderError("The provider returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() || "";
    for (const line of parts) yield line;
  }
  buffer += decoder.decode();
  if (buffer) yield buffer;
}

async function* sseData(response) {
  for await (const line of lines(response)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    yield data;
  }
}

async function readError(response) {
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      return body.error?.message || body.message || text.slice(0, 400);
    } catch {
      return text.slice(0, 400);
    }
  } catch {
    return `HTTP ${response.status}`;
  }
}

function combinedSignal(signal, ms = 180_000) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error("The model timed out.")), ms);
  timer.unref?.();
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    },
    { once: true },
  );
  return controller.signal;
}

function openAiEndpoint(route) {
  return `${openAiBase(route.provider, route.base)}/chat/completions`;
}

async function streamOpenAi({ route, system, messages, config, tools, toolDefs, emit, signal, mode }) {
  const endpoint = openAiEndpoint(route);
  const headers = { "content-type": "application/json", accept: "text/event-stream" };
  if (route.key) headers.authorization = `Bearer ${route.key}`;
  if (route.provider === "openrouter") {
    headers["http-referer"] = "https://github.com/Felixtheloafer/Vrindavan2";
    headers["x-title"] = "Radha Agent";
  }
  const working = [{ role: "system", content: system }, ...messages];
  let allText = "";
  let rounds = 0;
  let toolsEnabled = toolDefs.length > 0;
  let toolFallback = false;
  emit({ type: "meta", provider: route.provider, model: route.model, route: route.kind });

  while (rounds <= 6) {
    const body = {
      model: route.model,
      messages: working,
      stream: true,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };
    if (toolsEnabled) {
      body.tools = toolDefs;
      body.tool_choice = "auto";
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: combinedSignal(signal),
    });
    if (!response.ok) {
      const message = await readError(response);
      if (toolsEnabled && !toolFallback && /tool|function/i.test(message)) {
        toolFallback = true;
        toolsEnabled = false;
        emit({ type: "notice", text: "This model does not accept tools; continuing without them." });
        continue;
      }
      throw new ProviderError(`${route.provider}: ${message}`, response.status === 401 || response.status === 403 ? 502 : response.status);
    }

    const calls = new Map();
    let roundText = "";
    let finish = "";
    for await (const data of sseData(response)) {
      if (data === "[DONE]") break;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.error) throw new ProviderError(event.error.message || String(event.error));
      const choice = event.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta || {};
      if (typeof delta.content === "string" && delta.content) {
        roundText += delta.content;
        allText += delta.content;
        emit({ type: "delta", text: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const part of delta.tool_calls) {
          const index = Number.isInteger(part.index) ? part.index : calls.size;
          const current = calls.get(index) || { id: "", name: "", arguments: "" };
          if (part.id) current.id = part.id;
          if (part.function?.name) current.name = part.function.name;
          if (part.function?.arguments) current.arguments += part.function.arguments;
          calls.set(index, current);
        }
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }

    const toolCalls = [...calls.entries()]
      .map(([index, call]) => ({
        id: call.id || `call_${Date.now()}_${index}`,
        type: "function",
        function: { name: call.name, arguments: call.arguments || "{}" },
      }))
      .filter((call) => call.function.name);

    if (toolCalls.length && rounds < 6 && toolsEnabled) {
      working.push({ role: "assistant", content: roundText || null, tool_calls: toolCalls });
      for (const call of toolCalls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        emit({ type: "tool", name: call.function.name, status: "running" });
        let result;
        try {
          result = await tools.execute(call.function.name, args, config);
        } catch (error) {
          result = `Error: ${error.message}`;
        }
        emit({ type: "tool", name: call.function.name, status: "done" });
        working.push({
          role: "tool",
          tool_call_id: call.id,
          content: String(result).slice(0, 12000),
        });
      }
      rounds++;
      continue;
    }

    if (finish === "length") emit({ type: "notice", text: "The answer reached the model's length limit." });
    return { content: allText.trim(), provider: route.provider, model: route.model };
  }
  throw new ProviderError("The tool loop exceeded its limit.", 508);
}



async function streamAnthropic({ route, system, messages, config, tools, toolDefs, emit, signal }) {
  if (!route.key) throw new ProviderError("Anthropic needs an API key in Settings.", 503);
  const working = messages.map((m) => ({ role: m.role, content: m.content }));
  const anthropicTools = toolDefs.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
  let allText = "";
  let rounds = 0;
  emit({ type: "meta", provider: route.provider, model: route.model, route: route.kind });

  while (rounds <= 6) {
    const body = {
      model: route.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system,
      messages: working,
      stream: true,
    };
    if (anthropicTools.length) body.tools = anthropicTools;
    const response = await fetch(`${CLOUD_BASE.anthropic}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "x-api-key": route.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: combinedSignal(signal),
    });
    if (!response.ok) {
      const message = await readError(response);
      throw new ProviderError(`Anthropic: ${message}`, 502);
    }

    const blocks = new Map();
    let stopReason = "";
    for await (const data of sseData(response)) {
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.type === "error") throw new ProviderError(event.error?.message || "Anthropic stream error.");
      if (event.type === "content_block_start") {
        const block = event.content_block || {};
        blocks.set(event.index ?? blocks.size, { ...block, text: block.text || "", partial: "" });
      } else if (event.type === "content_block_delta") {
        const block = blocks.get(event.index);
        if (!block) continue;
        if (event.delta?.type === "text_delta" && event.delta.text) {
          block.text += event.delta.text;
          allText += event.delta.text;
          emit({ type: "delta", text: event.delta.text });
        } else if (event.delta?.type === "input_json_delta") {
          block.partial += event.delta.partial_json || "";
        }
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
      } else if (event.type === "message_stop") {
        break;
      }
    }

    const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, block]) => block);
    const assistantContent = [];
    for (const block of ordered) {
      if (block.type === "tool_use") {
        let input = {};
        try {
          input = JSON.parse(block.partial || "{}");
        } catch {
          input = {};
        }
        assistantContent.push({ type: "tool_use", id: block.id, name: block.name, input });
      } else if (block.type === "text" && block.text) {
        assistantContent.push({ type: "text", text: block.text });
      }
    }
    const toolUses = assistantContent.filter((block) => block.type === "tool_use");

    if (toolUses.length && rounds < 6 && anthropicTools.length) {
      working.push({ role: "assistant", content: assistantContent });
      const results = [];
      for (const call of toolUses) {
        emit({ type: "tool", name: call.name, status: "running" });
        let result;
        try {
          result = await tools.execute(call.name, call.input, config);
        } catch (error) {
          result = `Error: ${error.message}`;
        }
        emit({ type: "tool", name: call.name, status: "done" });
        results.push({ type: "tool_result", tool_use_id: call.id, content: String(result).slice(0, 12000) });
      }
      working.push({ role: "user", content: results });
      rounds++;
      continue;
    }

    if (stopReason === "max_tokens") emit({ type: "notice", text: "The answer reached the model's length limit." });
    return { content: allText.trim(), provider: route.provider, model: route.model };
  }
  throw new ProviderError("The tool loop exceeded its limit.", 508);
}


async function streamGemini({ route, system, messages, config, tools, toolDefs, emit, signal }) {
  if (!route.key) throw new ProviderError("Gemini needs an API key in Settings.", 503);
  const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const declarations = toolDefs.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
  let allText = "";
  let rounds = 0;
  emit({ type: "meta", provider: route.provider, model: route.model, route: route.kind });

  while (rounds <= 6) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxTokens },
    };
    if (declarations.length) body.tools = [{ functionDeclarations: declarations }];
    const endpoint = `${CLOUD_BASE.gemini}/models/${encodeURIComponent(route.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(route.key)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: combinedSignal(signal),
    });
    if (!response.ok) {
      const message = await readError(response);
      throw new ProviderError(`Gemini: ${message}`, 502);
    }

    const calls = [];
    let finish = "";
    for await (const data of sseData(response)) {
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.error) throw new ProviderError(event.error.message || "Gemini stream error.");
      const candidate = event.candidates?.[0];
      if (!candidate) continue;
      for (const part of candidate.content?.parts || []) {
        if (typeof part.text === "string" && part.text) {
          allText += part.text;
          emit({ type: "delta", text: part.text });
        }
        if (part.functionCall?.name) calls.push({ name: part.functionCall.name, args: part.functionCall.args || {} });
      }
      if (candidate.finishReason) finish = candidate.finishReason;
    }

    if (calls.length && rounds < 6 && declarations.length) {
      contents.push({ role: "model", parts: calls.map((call) => ({ functionCall: { name: call.name, args: call.args } })) });
      const parts = [];
      for (const call of calls) {
        emit({ type: "tool", name: call.name, status: "running" });
        let result;
        try {
          result = await tools.execute(call.name, call.args, config);
        } catch (error) {
          result = `Error: ${error.message}`;
        }
        emit({ type: "tool", name: call.name, status: "done" });
        parts.push({ functionResponse: { name: call.name, response: { result: String(result).slice(0, 12000) } } });
      }
      contents.push({ role: "user", parts });
      rounds++;
      continue;
    }

    if (finish === "MAX_TOKENS") emit({ type: "notice", text: "The answer reached the model's length limit." });
    return { content: allText.trim(), provider: route.provider, model: route.model };
  }
  throw new ProviderError("The tool loop exceeded its limit.", 508);
}

export async function streamCompletion({ messages, config, persona, memories, knowledge, tools, mode = "chat", signal, emit, model, provider }) {
  const prepared = prepareMessages(messages);
  const system = buildSystem({ persona, memories, knowledge, mode, toolsEnabled: Boolean(config.tools?.enabled) });
  const toolDefs = config.tools?.enabled ? tools.definitions : [];
  const route = await chooseRoute(config, { model, provider });
  let deltaCount = 0;
  const trackedEmit = (event) => {
    if (event.type === "delta") deltaCount++;
    emit(event);
  };
  const run = (selected) => {
    const options = { route: selected, system, messages: prepared, config, tools, toolDefs, emit: trackedEmit, signal, mode };
    if (selected.provider === "anthropic") return streamAnthropic(options);
    if (selected.provider === "gemini") return streamGemini(options);
    return streamOpenAi(options);
  };

  try {
    return await run(route);
  } catch (error) {
    const cloudKey = providerKey(config, config.cloud?.provider);
    if (route.kind === "local" && config.auto && deltaCount === 0 && cloudKey) {
      emit({ type: "notice", text: "The local mind did not answer; continuing with your cloud mind." });
      const cloudRoute = {
        kind: "cloud",
        provider: config.cloud.provider,
        model: model || config.cloud.model,
        base: CLOUD_BASE[config.cloud.provider],
        key: cloudKey,
      };
      return run(cloudRoute);
    }
    throw error;
  }
}

