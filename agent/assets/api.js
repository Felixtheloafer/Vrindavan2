// Thin client for the local Radha server. The server owns all provider keys.
const TOKEN_KEY = "radha.accessToken";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing */
  }
}

async function request(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const type = res.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const message =
      (payload && payload.error) ||
      (payload && payload.message) ||
      (typeof payload === "string" && payload.slice(0, 240)) ||
      `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return payload;
}

export const api = {
  health: () => request("/api/health"),
  getConfig: () => request("/api/config"),
  saveConfig: (config) => request("/api/config", { method: "PUT", body: JSON.stringify(config) }),
  listMemory: (q = "") => request(`/api/memory${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  addMemory: (text, kind = "fact") =>
    request("/api/memory", { method: "POST", body: JSON.stringify({ text, kind }) }),
  deleteMemory: (id) => request(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listKnowledge: () => request("/api/knowledge"),
  addKnowledge: (name, text, pack = "general") =>
    request("/api/knowledge", { method: "POST", body: JSON.stringify({ name, text, pack }) }),
  deleteKnowledge: (name) => request(`/api/knowledge/${encodeURIComponent(name)}`, { method: "DELETE" }),
  getPersona: () => request("/api/persona"),
  savePersona: (text) => request("/api/persona", { method: "PUT", body: JSON.stringify({ text }) }),
  studio: (messages) =>
    request("/api/studio", { method: "POST", body: JSON.stringify({ messages }) }).catch(async (err) => {
      if (err.status === 404) return request("/api/chat", { method: "POST", body: JSON.stringify({ messages, mode: "studio" }) });
      throw err;
    }),
};

/**
 * Stream a chat completion over SSE.
 * @param {Array<{role:string,content:string}>} messages
 * @param {(event: object) => void} onEvent
 * @param {{signal?: AbortSignal, mode?: string, model?: string}} options
 */
export async function streamChat(messages, onEvent, options = {}) {
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ messages, mode: options.mode || "chat", model: options.model || undefined }),
    signal: options.signal,
  });

  if (!res.ok) {
    let message = `The mind could not be reached (${res.status}).`;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error("Streaming is not supported by this browser.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines = [];

  const dispatch = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join("\n");
    dataLines = [];
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      event = { type: "delta", text: raw };
    }
    if (!event.type) event.type = eventName === "message" ? "delta" : eventName;
    if (eventName === "done") event.type = "done";
    if (eventName === "error") event.type = "error";
    onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") {
        dispatch();
        eventName = "message";
      } else if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  dispatch();
}
