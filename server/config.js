import { promises as fs } from "node:fs";
import path from "node:path";

export const PROVIDERS = ["ollama", "lmstudio", "llamacpp", "openai", "openrouter", "groq", "anthropic", "gemini"];
export const LOCAL_PROVIDERS = ["ollama", "lmstudio", "llamacpp"];
export const CLOUD_PROVIDERS = ["openai", "openrouter", "groq", "anthropic", "gemini"];

export const DEFAULTS = {
  auto: true,
  local: { provider: "ollama", url: "http://127.0.0.1:11434", model: "llama3.1:8b" },
  cloud: { provider: "openai", model: "gpt-4o-mini", keys: {} },
  temperature: 0.7,
  maxTokens: 1400,
  tools: { enabled: true, fetch: true },
};

const KEY_ENV = {
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export function envKey(provider) {
  if (provider === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return process.env[KEY_ENV[provider]] || "";
}

export function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(String(host).toLowerCase());
}

export function validHttpUrl(raw) {
  try {
    const url = new URL(String(raw));
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
}

function cleanText(value, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function createConfigStore(dataDir) {
  const file = path.join(dataDir, "config.json");

  async function read() {
    try {
      const raw = JSON.parse(await fs.readFile(file, "utf8"));
      return {
        ...structuredClone(DEFAULTS),
        ...raw,
        local: { ...DEFAULTS.local, ...(raw.local || {}) },
        cloud: { ...DEFAULTS.cloud, ...(raw.cloud || {}) },
        tools: { ...DEFAULTS.tools, ...(raw.tools || {}) },
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  async function write(config) {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await fs.chmod(tmp, 0o600);
    await fs.rename(tmp, file);
  }

  const keyFor = (config, provider = config.cloud?.provider) =>
    config.cloud?.keys?.[provider] ||
    (config.cloud?.provider === provider ? config.cloud?.apiKey : "") ||
    envKey(provider);


  function redact(config) {
    const cloud = config.cloud || {};
    const key = keyFor(config, cloud.provider);
    return {
      auto: Boolean(config.auto),
      local: {
        provider: config.local.provider,
        url: config.local.url,
        model: config.local.model,
      },
      cloud: {
        provider: cloud.provider,
        model: cloud.model,
        hasKey: Boolean(key),
        keyHint: key ? `••••${String(key).slice(-4)}` : "",
      },
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      tools: { enabled: Boolean(config.tools.enabled), fetch: Boolean(config.tools.fetch) },
    };
  }

  async function update(patch = {}) {
    const current = await read();
    const next = structuredClone(current);
    if (typeof patch.auto === "boolean") next.auto = patch.auto;
    if (patch.local && typeof patch.local === "object") {
      if (PROVIDERS.includes(patch.local.provider)) next.local.provider = patch.local.provider;
      if (patch.local.url !== undefined) {
        const url = cleanText(patch.local.url, 500);
        if (!validHttpUrl(url)) throw Object.assign(new Error("Local base URL must be a valid http(s) URL."), { status: 400 });
        next.local.url = url.replace(/\/+$/, "");
      }
      if (patch.local.model !== undefined) {
        const model = cleanText(patch.local.model, 200);
        if (!model) throw Object.assign(new Error("A local model name is required."), { status: 400 });
        next.local.model = model;
      }
    }
    if (patch.cloud && typeof patch.cloud === "object") {
      if (CLOUD_PROVIDERS.includes(patch.cloud.provider)) next.cloud.provider = patch.cloud.provider;
      if (patch.cloud.model !== undefined) {
        const model = cleanText(patch.cloud.model, 200);
        if (!model) throw Object.assign(new Error("A cloud model name is required."), { status: 400 });
        next.cloud.model = model;
      }
      if (patch.cloud.apiKey !== undefined) {
        const key = cleanText(patch.cloud.apiKey, 500);
        next.cloud.keys = { ...(next.cloud.keys || {}) };
        if (key) next.cloud.keys[next.cloud.provider] = key;
        else delete next.cloud.keys[next.cloud.provider];
        delete next.cloud.apiKey;
      }
    }
    if (patch.temperature !== undefined) {
      const temp = Number(patch.temperature);
      if (!Number.isFinite(temp) || temp < 0 || temp > 2) {
        throw Object.assign(new Error("Temperature must be between 0 and 2."), { status: 400 });
      }
      next.temperature = temp;
    }
    if (patch.maxTokens !== undefined) {
      const max = Number(patch.maxTokens);
      if (!Number.isInteger(max) || max < 64 || max > 32000) {
        throw Object.assign(new Error("maxTokens must be between 64 and 32000."), { status: 400 });
      }
      next.maxTokens = max;
    }
    if (patch.tools && typeof patch.tools === "object") {
      if (typeof patch.tools.enabled === "boolean") next.tools.enabled = patch.tools.enabled;
      if (typeof patch.tools.fetch === "boolean") next.tools.fetch = patch.tools.fetch;
    }
    await write(next);
    return next;
  }

  return { file, read, write, update, redact, keyFor };
}
