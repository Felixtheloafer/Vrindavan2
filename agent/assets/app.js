import { api, streamChat, getToken, setToken } from "./api.js";
import { renderMarkdown, escape } from "./markdown.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const STORE_THREADS = "radha.threads.v1";
const DOWNLOAD_URL =
  "https://github.com/Felixtheloafer/Vrindavan2/releases/download/radha-agent-v1.0.0/radha-agent-v1.0.0.zip";

const state = {
  view: "chat",
  threads: [],
  currentId: null,
  streaming: false,
  abort: null,
  config: null,
  health: null,
  memories: [],
  knowledge: [],
  persona: "",
  voice: false,
  recognition: null,
  lastAssistantEl: null,
};

const VIEW_META = {
  chat: ["In conversation", "Radha"],
  memory: ["The living ledger", "Memory"],
  brain: ["The Phani lineage", "Brain & Knowledge"],
  studio: ["Phani V9 · studio", "Studio"],
  settings: ["Sovereignty, by design", "Settings"],
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `t_${Date.now()}_${Math.random().toString(36).slice(2)}`);
const now = () => Date.now();
const clock = (ts = Date.now()) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function toast(message, isError = false) {
  const stack = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast${isError ? " is-error" : ""}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 250);
  }, 4200);
}

function loadThreads() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_THREADS) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((t) => t && typeof t.id === "string" && Array.isArray(t.messages)).slice(0, 60);
  } catch {
    return [];
  }
}

function saveThreads() {
  try {
    localStorage.setItem(STORE_THREADS, JSON.stringify(state.threads.slice(0, 60)));
  } catch {
    toast("This browser is out of storage; older threads may be dropped.", true);
  }
}

function currentThread() {
  return state.threads.find((t) => t.id === state.currentId) || null;
}

function newThread(activate = true) {
  const thread = { id: uid(), title: "New thread", createdAt: now(), updatedAt: now(), messages: [] };
  state.threads.unshift(thread);
  if (activate) state.currentId = thread.id;
  saveThreads();
  renderThreads();
  return thread;
}

function titleFrom(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > 52 ? `${clean.slice(0, 50)}…` : clean || "New thread";
}

/* ── Boot & navigation ───────────────────────────────────── */
function boot() {
  state.threads = loadThreads();
  state.currentId = state.threads[0]?.id || null;
  bindEvents();
  renderThreads();
  renderTranscript();
  renderSuggestions();
  refreshAll();
  setInterval(refreshHealth, 20000);
}

async function refreshAll() {
  await Promise.allSettled([loadConfig(), refreshHealth(), loadMemory(), loadKnowledge(), loadPersona()]);
  updateCounts();
}

function showView(view) {
  if (!VIEW_META[view]) return;
  state.view = view;
  $$(".view").forEach((el) => el.classList.toggle("is-active", el.id === `view-${view}`));
  $$(".nav-item").forEach((el) => el.classList.toggle("is-active", el.dataset.view === view));
  const [eyebrow, title] = VIEW_META[view];
  $("#view-eyebrow").textContent = eyebrow;
  $("#view-title").textContent = title;
  $("#sidebar").classList.remove("is-open");
  $("#presence").classList.remove("is-open");
  if (view === "memory") loadMemory();
  if (view === "brain") {
    loadKnowledge();
    loadPersona();
  }
  if (view === "settings") loadConfig();
  if (view === "chat") setTimeout(() => $("#prompt").focus(), 60);
}

/* ── Threads & transcript ────────────────────────────────── */
function renderThreads() {
  const list = $("#thread-list");
  list.innerHTML = "";
  const sorted = [...state.threads].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!sorted.length) {
    list.innerHTML = `<p class="thread-empty">No threads yet. The first page is blank.</p>`;
    return;
  }
  for (const thread of sorted.slice(0, 14)) {
    const btn = document.createElement("button");
    btn.className = `thread${thread.id === state.currentId ? " is-active" : ""}`;
    btn.textContent = thread.title;
    btn.title = thread.title;
    btn.addEventListener("click", () => {
      state.currentId = thread.id;
      saveThreads();
      renderThreads();
      renderTranscript();
      showView("chat");
    });
    list.appendChild(btn);
  }
}

function heroMarkup() {
  return `
    <div class="hero">
      <div class="hero-medallion"><img src="assets/radha.svg" alt="" /></div>
      <h2>Namaste. I am <em>Radha</em>.</h2>
      <p>Your mind at home in this machine. I can think, remember, read your workspace, shape a film, and stay beside you when the network goes quiet.</p>
      <div class="hero-rule"></div>
      <p class="hero-meta">Local-first · private by default · yours</p>
    </div>`;
}

function renderTranscript() {
  const transcript = $("#transcript");
  const thread = currentThread();
  transcript.innerHTML = "";
  state.lastAssistantEl = null;
  if (!thread || !thread.messages.length) {
    transcript.innerHTML = heroMarkup();
    return;
  }
  for (const message of thread.messages) {
    const el = messageEl(message);
    transcript.appendChild(el);
    if (message.role === "assistant") state.lastAssistantEl = el;
  }
  scrollTranscript(true);
}

function scrollTranscript(force = false) {
  const el = $("#transcript");
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (force || distance < 180) el.scrollTop = el.scrollHeight;
}
function messageEl(message) {
  const article = document.createElement("article");
  article.className = `msg ${message.role === "assistant" ? "assistant" : "user"}`;
  article.dataset.id = message.id || "";

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.innerHTML =
    message.role === "assistant" ? `<img src="assets/radha.svg" alt="Radha" />` : `<span>✦</span>`;

  const body = document.createElement("div");
  body.className = "msg-body";

  const head = document.createElement("div");
  head.className = "msg-head";
  head.innerHTML = `<span class="msg-name">${message.role === "assistant" ? "Radha" : "You"}</span><span class="msg-time">${clock(message.ts)}</span>`;

  const text = document.createElement("div");
  text.className = "msg-text";
  text.dataset.role = "text";
  text.innerHTML = renderMarkdown(message.content || "");

  const tools = document.createElement("div");
  tools.className = "msg-tools";
  tools.dataset.role = "tools";
  (message.tools || []).forEach((tool) => tools.appendChild(toolChip(tool)));

  const actions = document.createElement("div");
  actions.className = "msg-actions";
  const copy = document.createElement("button");
  copy.className = "msg-action";
  copy.textContent = "copy";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      toast("Copied.");
    } catch {
      toast("Clipboard unavailable in this browser.", true);
    }
  });
  actions.appendChild(copy);
  if (message.role === "assistant") {
    const remember = document.createElement("button");
    remember.className = "msg-action";
    remember.textContent = "remember this";
    remember.addEventListener("click", () =>
      openMemoryFromText(`From a conversation: ${String(message.content).slice(0, 500)}`),
    );
    actions.appendChild(remember);
  }

  body.append(head, text, tools, actions);
  if (message.role === "assistant") article.append(avatar, body);
  else article.append(body, avatar);
  return article;
}

function toolChip(tool) {
  const chip = document.createElement("span");
  const name = typeof tool === "string" ? tool : tool.name || "tool";
  chip.className = "tool-chip";
  chip.dataset.name = name;
  chip.textContent = typeof tool === "string" ? name : `${name}${tool.status === "running" ? " …" : " ✓"}`;
  if (typeof tool !== "string" && tool.status === "running") chip.classList.add("is-running");
  return chip;
}

function updateLastAssistant(patch = {}) {
  const thread = currentThread();
  if (!thread) return;
  const msg = [...thread.messages].reverse().find((m) => m.role === "assistant" && m.pending);
  if (!msg) return;
  Object.assign(msg, patch);
  const el = state.lastAssistantEl;
  if (!el) return;
  const text = $('[data-role="text"]', el);
  if (text && patch.content !== undefined) text.innerHTML = renderMarkdown(msg.content || "");
  const tools = $('[data-role="tools"]', el);
  if (tools && patch.tools) {
    tools.innerHTML = "";
    msg.tools.forEach((t) => tools.appendChild(toolChip(t)));
  }
}

/* ── Sending & streaming ─────────────────────────────────── */
async function sendMessage(rawText) {
  if (state.streaming) {
    state.abort?.abort();
    return;
  }
  const text = String(rawText || "").trim();
  if (!text) return;

  let thread = currentThread();
  if (!thread) thread = newThread(true);
  if (!thread.messages.length) {
    thread.title = titleFrom(text);
    thread.updatedAt = now();
  }

  thread.messages.push({ id: uid(), role: "user", content: text, ts: now() });
  const assistant = {
    id: uid(),
    role: "assistant",
    content: "",
    ts: now(),
    pending: true,
    tools: [],
    provider: "",
    model: "",
  };
  thread.messages.push(assistant);
  thread.updatedAt = now();

  $("#prompt").value = "";
  resizePrompt();
  renderTranscript();
  renderThreads();
  saveThreads();
  setStreaming(true);

  const history = thread.messages
    .filter((m) => !m.pending && m.content)
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.content }));

  state.abort = new AbortController();
  try {
    await streamChat(history, (event) => handleStreamEvent(event, assistant, thread), {
      signal: state.abort.signal,
    });
    if (assistant.pending) finishAssistant(assistant, thread);
  } catch (error) {
    if (error.name === "AbortError") {
      assistant.content = assistant.content || "_(stopped)_";
    } else {
      assistant.content =
        assistant.content ||
        `I could not reach a mind.\n\n${friendlyError(error)}\n\nOpen **Settings** to choose a local model, or start the server with \`npm run agent\` if it is not already running.`;
      if (error.status === 401) promptForToken();
      toast(error.message || "The mind could not be reached.", true);
    }
  } finally {
    finishAssistant(assistant, thread);
    setStreaming(false);
    state.abort = null;
  }
}


function handleStreamEvent(event, assistant, thread) {
  const type = event.type || "delta";
  if (type === "meta") {
    assistant.provider = event.provider || assistant.provider;
    assistant.model = event.model || assistant.model;
    if (event.provider || event.model) updateMindLabel(event);
    return;
  }
  if (type === "delta") {
    const piece = event.text ?? event.delta ?? event.content ?? "";
    if (piece) {
      assistant.content += piece;
      updateLastAssistant({ content: assistant.content });
      scrollTranscript();
    }
    return;
  }
  if (type === "tool" || type === "tool_start" || type === "tool_result") {
    const name = event.name || event.tool || "tool";
    const status = type === "tool_result" || event.status === "done" ? "done" : "running";
    const existing = [...assistant.tools].reverse().find((t) => t.name === name && t.status === "running");
    if (existing && status === "done") existing.status = "done";
    else if (!assistant.tools.some((t) => t.name === name && t.status === status)) assistant.tools.push({ name, status });
    updateLastAssistant({ tools: assistant.tools });
    return;
  }
  if (type === "done") {
    if (event.content && !assistant.content) assistant.content = event.content;
    if (event.text && !assistant.content) assistant.content = event.text;
    assistant.provider = event.provider || assistant.provider;
    assistant.model = event.model || assistant.model;
    finishAssistant(assistant, thread);
    if (state.voice) speak(assistant.content);
    return;
  }
  if (type === "error") {
    assistant.content += `\n\n_${event.error || event.message || "The model stream failed."}_`;
    updateLastAssistant({ content: assistant.content });
  }
}

function finishAssistant(assistant, thread) {
  if (!assistant.pending) return;
  assistant.pending = false;
  assistant.ts = assistant.ts || now();
  if (thread) thread.updatedAt = now();
  if (!assistant.content.trim()) assistant.content = "_No answer came back. Check the model in Settings._";
  const el = state.lastAssistantEl;
  if (el) {
    const text = $('[data-role="text"]', el);
    if (text) text.innerHTML = renderMarkdown(assistant.content);
    const tools = $('[data-role="tools"]', el);
    if (tools) {
      tools.innerHTML = "";
      (assistant.tools || []).forEach((t) => tools.appendChild(toolChip(t.status === "running" ? { ...t, status: "done" } : t)));
    }
  }
  saveThreads();
}

function setStreaming(on) {
  state.streaming = on;
  const send = $("#send");
  send.title = on ? "Stop generating" : "Send";
  send.innerHTML = on
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-7-8-1Z" /></svg>`;
  $("#composer-hint").textContent = on ? "She is composing… click send to stop." : "Enter to send · Shift + Enter for a new line";
  if (!on) $("#prompt").focus();
}

function friendlyError(error) {
  if (!error) return "Unknown error.";
  if (error.status === 503) return "No model is configured yet.";
  if (error.status === 401) return "The server asked for an access token.";
  if (/fetch|network|failed to fetch/i.test(error.message)) {
    return "The local server is not answering. In the project folder, run `npm run agent` and open **http://127.0.0.1:8787**.";
  }
  return error.message;
}

/* ── Config & health ─────────────────────────────────────── */
async function loadConfig() {
  try {
    const cfg = await api.getConfig();
    state.config = cfg;
    const local = cfg.local || {};
    const cloud = cfg.cloud || {};
    $("#cfg-auto").checked = cfg.auto ?? true;
    $("#cfg-local-provider").value = local.provider || cfg.localProvider || "ollama";
    $("#cfg-local-url").value = local.url || local.baseUrl || cfg.localUrl || "http://127.0.0.1:11434";
    $("#cfg-local-model").value = local.model || cfg.localModel || "llama3.1:8b";
    $("#cfg-cloud-provider").value = cloud.provider || cfg.cloudProvider || "openai";
    $("#cfg-cloud-model").value = cloud.model || cfg.cloudModel || "gpt-4o-mini";
    $("#cfg-temperature").value = cfg.temperature ?? 0.7;
    const tools = cfg.tools || {};
    $("#cfg-tools").checked = tools.enabled ?? cfg.allowTools ?? true;
    $("#cfg-fetch").checked = tools.fetch ?? cfg.allowFetch ?? true;
    const keyInput = $("#cfg-api-key");
    keyInput.value = "";
    const hasKey = cloud.hasKey ?? cfg.hasCloudKey ?? false;
    keyInput.placeholder = hasKey ? cloud.keyHint || "•••••••• stored" : "not set";
    $("#key-state").textContent = hasKey
      ? `A cloud key is stored on this machine${cloud.keyHint ? ` (${cloud.keyHint})` : ""}. It is never sent to this page.`
      : "No cloud key is stored. Radha will use your local model only.";
    updateMindLabel({ provider: local.provider || "ollama", model: local.model || "local model" });
  } catch (error) {
    if (error.status === 401) promptForToken();
    else toast("Could not read settings from the local server.", true);
  }
}

async function saveSettings() {
  const apiKey = $("#cfg-api-key").value.trim();
  const payload = {
    auto: $("#cfg-auto").checked,
    local: {
      provider: $("#cfg-local-provider").value,
      url: $("#cfg-local-url").value.trim(),
      model: $("#cfg-local-model").value.trim(),
    },
    cloud: {
      provider: $("#cfg-cloud-provider").value,
      model: $("#cfg-cloud-model").value.trim(),
      ...(apiKey ? { apiKey } : {}),
    },
    temperature: Number($("#cfg-temperature").value) || 0.7,
    tools: { enabled: $("#cfg-tools").checked, fetch: $("#cfg-fetch").checked },
  };
  try {
    await api.saveConfig(payload);
    $("#cfg-api-key").value = "";
    toast("Settings saved. She will use them on the next breath.");
    await Promise.all([loadConfig(), refreshHealth()]);
  } catch (error) {
    toast(error.message || "Could not save settings.", true);
  }
}


async function refreshHealth() {
  try {
    const health = await api.health();
    state.health = health;
    const local = health.local || {};
    const localUp = Object.entries(local)
      .filter(([, v]) => v === true || v?.ok === true)
      .map(([k]) => k);
    const cloud = health.cloudConfigured || health.cloud || [];
    const cloudList = Array.isArray(cloud) ? cloud : Object.keys(cloud);
    const setup = $("#setup-banner");
    if (setup) setup.hidden = localUp.length > 0 || cloudList.length > 0;
    const dot = $("#presence-dot");
    dot.classList.remove("is-live", "is-cloud");
    if (localUp.length) {
      dot.classList.add("is-live");
      $("#presence-title").textContent = "A local mind is awake";
      $("#presence-sub").textContent = `${localUp.join(" · ")}${cloudList.length ? " · cloud ready" : ""}`;
      $("#health-tag").textContent = "local available";
    } else if (cloudList.length) {
      dot.classList.add("is-cloud");
      $("#presence-title").textContent = "Cloud mind ready";
      $("#presence-sub").textContent = `${cloudList.join(" · ")} · local offline`;
      $("#health-tag").textContent = "cloud only";
    } else {
      $("#presence-title").textContent = "No mind chosen yet";
      $("#presence-sub").textContent = "Settings → local or cloud";
      $("#health-tag").textContent = "setup needed";
    }
    const cfg = state.config?.local || {};
    const provider = local.ollama ? "ollama" : local.lmstudio ? "lmstudio" : cloudList[0];
    if (provider) updateMindLabel({ provider, model: cfg.model || "default model" });
  } catch (error) {
    const dot = $("#presence-dot");
    dot.classList.remove("is-live", "is-cloud");
    $("#presence-title").textContent = "Server not reachable";
    $("#presence-sub").textContent = "Run npm run agent";
    $("#health-tag").textContent = "offline";
    if (error.status === 401) promptForToken();
  }
}

function updateMindLabel(event) {
  const provider = event.provider || event.route || "local";
  const model = event.model || "";
  $("#model-label").textContent = `${providerLabel(provider)}${model ? ` · ${model}` : ""}`;
  $("#presence-mind").textContent = providerLabel(provider);
  $("#presence-mind-sub").textContent = model || "model selected";
  const dot = $("#model-dot");
  dot.classList.remove("is-live", "is-cloud");
  if (["ollama", "lmstudio", "llamacpp", "local"].includes(String(provider))) dot.classList.add("is-live");
  else dot.classList.add("is-cloud");
}

function providerLabel(provider) {
  const map = {
    ollama: "Ollama",
    lmstudio: "LM Studio",
    llamacpp: "llama.cpp",
    local: "Local",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    groq: "Groq",
    anthropic: "Claude",
    gemini: "Gemini",
  };
  return map[provider] || provider;
}

function promptForToken() {
  openModal({
    title: "Server access token",
    body: `<p>This server is exposed beyond loopback. Paste the <code>AGENT_ACCESS_TOKEN</code> you set when starting it. It is kept in this browser only.</p>
      <label class="field"><span>Token</span><input id="token-input" type="password" autocomplete="off" /></label>`,
    actions: [
      { label: "Cancel", value: "cancel" },
      { label: "Unlock", value: "save", primary: true },
    ],
    onSubmit: async (dialog) => {
      const token = $("#token-input", dialog).value.trim();
      if (!token) return;
      setToken(token);
      toast("Token saved. Try again.");
      refreshAll();
    },
  });
}

/* ── Memory ──────────────────────────────────────────────── */
function normaliseList(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of [...keys, "items", "memories", "knowledge", "pages", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

async function loadMemory(query = "") {
  try {
    const payload = await api.listMemory(query);
    state.memories = normaliseList(payload);
    renderMemories();
    updateCounts();
  } catch (error) {
    if (error.status === 401) promptForToken();
  }
}

function renderMemories() {
  const list = $("#memory-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.memories.length) {
    list.innerHTML = `<p class="empty-note">Nothing kept yet. Tell her what matters, or ask her to remember it in conversation.</p>`;
    return;
  }
  for (const memory of state.memories) {
    const row = document.createElement("div");
    row.className = "memory-item";
    const left = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = memory.text || memory.content || "";
    const meta = document.createElement("div");
    meta.className = "memory-meta";
    meta.innerHTML = `<span class="memory-kind">${escape(memory.kind || "fact")}</span><span>${memory.createdAt ? new Date(memory.createdAt).toLocaleDateString() : ""}</span>`;
    left.append(text, meta);
    const del = document.createElement("button");
    del.className = "memory-del";
    del.title = "Forget this";
    del.textContent = "×";
    del.addEventListener("click", async () => {
      try {
        await api.deleteMemory(memory.id);
        state.memories = state.memories.filter((m) => m.id !== memory.id);
        renderMemories();
        updateCounts();
        toast("Forgotten.");
      } catch (error) {
        toast(error.message || "Could not remove that memory.", true);
      }
    });
    row.append(left, del);
    list.appendChild(row);
  }
}

function updateCounts() {
  const m = state.memories.length;
  const k = state.knowledge.length;
  $("#memory-count").textContent = String(m);
  $("#presence-memory").textContent = String(m);
  $("#presence-knowledge").textContent = String(k);
  $("#stat-memory").textContent = String(m);
  $("#stat-knowledge").textContent = String(k);
  $("#stat-threads").textContent = String(state.threads.filter((t) => t.messages.length).length);
}


/* ── Knowledge ───────────────────────────────────────────── */
async function loadKnowledge() {
  try {
    const payload = await api.listKnowledge();
    state.knowledge = normaliseList(payload, ["pages", "files"]);
    renderKnowledge();
    updateCounts();
  } catch (error) {
    if (error.status === 401) promptForToken();
  }
}

function knowledgePack(item) {
  return String(
    item.pack || item.folder || item.category || (item.name || "").split("_")[0] || "general",
  ).toLowerCase();
}

function renderKnowledge() {
  const list = $("#knowledge-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.knowledge.length) {
    list.innerHTML = `<p class="empty-note">No pages yet. Import your private Phani V3 and V9 exports, or add notes by hand.</p>`;
  }
  for (const item of state.knowledge) {
    const row = document.createElement("div");
    row.className = "knowledge-item";
    const left = document.createElement("div");
    const name = document.createElement("p");
    name.className = "knowledge-name";
    name.textContent = item.name || item.title || "untitled";
    const meta = document.createElement("p");
    meta.className = "knowledge-meta";
    const size = item.size ? `${Math.max(1, Math.round(item.size / 1024))} KB` : item.chars ? `${item.chars} chars` : "";
    meta.textContent = [
      knowledgePack(item).toUpperCase(),
      size,
      item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "",
    ]
      .filter(Boolean)
      .join(" · ");
    left.append(name, meta);
    const del = document.createElement("button");
    del.className = "memory-del";
    del.textContent = "×";
    del.title = "Remove page";
    del.addEventListener("click", async () => {
      try {
        await api.deleteKnowledge(item.name);
        await loadKnowledge();
        toast("Page removed.");
      } catch (error) {
        toast(error.message || "Could not remove page.", true);
      }
    });
    row.append(left, del);
    list.appendChild(row);
  }
  const counts = { v3: 0, v9: 0 };
  for (const item of state.knowledge) {
    const pack = knowledgePack(item);
    if (pack.includes("v3") || pack.includes("brain")) counts.v3++;
    if (pack.includes("v9") || pack.includes("video")) counts.v9++;
  }
  $("#v3-count").textContent = `${counts.v3} page${counts.v3 === 1 ? "" : "s"}`;
  $("#v9-count").textContent = `${counts.v9} page${counts.v9 === 1 ? "" : "s"}`;
  $("#v3-status").textContent = counts.v3 ? "indexed" : "not imported";
  $("#v9-status").textContent = counts.v9 ? "indexed" : "not imported";
}

/* ── Persona ─────────────────────────────────────────────── */
async function loadPersona() {
  try {
    const payload = await api.getPersona();
    state.persona = typeof payload === "string" ? payload : payload.text || payload.persona || "";
    $("#persona-editor").value = state.persona;
  } catch {
    /* the server may not expose persona yet — keep the editor usable */
  }
}

async function savePersona() {
  const text = $("#persona-editor").value;
  try {
    await api.savePersona(text);
    state.persona = text;
    toast("Persona saved.");
  } catch (error) {
    toast(error.message || "Could not save persona.", true);
  }
}

/* ── Suggestions & modal ─────────────────────────────────── */
const SUGGESTIONS = [
  { label: "Plan my day", prompt: "Help me plan today. Ask me two questions first, then give me a short, realistic schedule." },
  { label: "Think with me", prompt: "I need a thinking partner. Ask me what I am wrestling with, then help me see it more clearly." },
  { label: "Read my workspace", prompt: "List the files in your workspace, read the most relevant one, and tell me what you notice." },
  { label: "Write a scene", prompt: "Write a short, cinematic scene set in Vrindavan at dusk. Maroon and gold, candlelight, restraint." },
];

function renderSuggestions() {
  const wrap = $("#suggestions");
  wrap.innerHTML = "";
  SUGGESTIONS.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion";
    btn.textContent = s.label;
    btn.addEventListener("click", () => {
      $("#prompt").value = s.prompt;
      resizePrompt();
      $("#prompt").focus();
    });
    wrap.appendChild(btn);
  });
}

function resizePrompt() {
  const el = $("#prompt");
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}

function openModal({ title, body, actions, onSubmit }) {
  const dialog = $("#modal");
  if (dialog.open) dialog.close();
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = body;
  const actionsEl = $("#modal-actions");
  actionsEl.innerHTML = "";
  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "submit";
    btn.value = action.value;
    btn.className = `btn ${action.primary ? "btn-primary" : "btn-ghost"}`;
    btn.textContent = action.label;
    actionsEl.appendChild(btn);
  }
  const card = $("#modal-card");
  card.onsubmit = async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    if (!submitter || submitter.value !== "save") {
      dialog.close();
      return;
    }
    submitter.disabled = true;
    const original = submitter.textContent;
    submitter.textContent = "Working…";
    try {
      const keepOpen = await onSubmit?.(dialog);
      if (!keepOpen) dialog.close();
    } catch (error) {
      toast(error.message || "That did not work.", true);
    } finally {
      submitter.disabled = false;
      submitter.textContent = original;
    }
  };
  dialog.showModal();
}

function openMemoryFromText(text) {
  showView("memory");
  $("#memory-text").value = text;
  $("#memory-text").focus();
  $("#memory-text").scrollIntoView({ block: "center", behavior: "smooth" });
}


function openKnowledgeModal(pack = "general") {
  const isV3 = pack === "v3";
  const isV9 = pack === "v9";
  openModal({
    title: isV3 ? "Import Phani V3" : isV9 ? "Import Phani V9" : "Add a knowledge page",
    body: `
      <p>These ChatGPT project links are private, so this app cannot read them directly. While signed in to ChatGPT, open the project, copy its instructions and notes, and bring them here. Exported <code>.md</code>, <code>.txt</code> and <code>.json</code> files can be selected below.</p>
      <label class="field"><span>Title</span><input id="kn-name" value="${isV3 ? "Phani V3 — AI Brain" : isV9 ? "Phani V9 — AI Video" : ""}" placeholder="e.g. Phani V3 — operating instructions" /></label>
      <label class="field"><span>Knowledge pack</span>
        <select id="kn-pack">
          <option value="general"${pack === "general" ? " selected" : ""}>General</option>
          <option value="v3"${isV3 ? " selected" : ""}>Phani V3 · AI Brain</option>
          <option value="v9"${isV9 ? " selected" : ""}>Phani V9 · AI Video</option>
        </select>
      </label>
      <label class="field"><span>Paste notes or instructions</span><textarea id="kn-text" rows="8" placeholder="Paste the project's custom instructions, frameworks, scripts, or notes…"></textarea></label>
      <label class="field"><span>Or choose text files <small>one or many</small></span><input id="kn-files" type="file" accept=".md,.markdown,.txt,.json,.csv" multiple /></label>`,
    actions: [
      { label: "Cancel", value: "cancel" },
      { label: "Import", value: "save", primary: true },
    ],
    onSubmit: async (dialog) => {
      const selectedPack = $("#kn-pack", dialog).value;
      const files = [...$("#kn-files", dialog).files];
      const text = $("#kn-text", dialog).value.trim();
      const baseName = $("#kn-name", dialog).value.trim();
      if (!files.length && !text) throw new Error("Paste some text or choose a file first.");
      let imported = 0;
      for (const file of files) {
        const content = await file.text();
        if (!content.trim()) continue;
        await api.addKnowledge(file.name, content, selectedPack);
        imported++;
      }
      if (text) {
        await api.addKnowledge(`${baseName || "Untitled note"}.md`, text, selectedPack);
        imported++;
      }
      await loadKnowledge();
      toast(
        `${imported} page${imported === 1 ? "" : "s"} indexed into Radha's ${selectedPack === "general" ? "library" : selectedPack.toUpperCase()}.`,
      );
    },
  });
}


/* ── Bindings ────────────────────────────────────────────── */
function bindEvents() {
  $$(".nav-item").forEach((el) => el.addEventListener("click", () => showView(el.dataset.view)));
  $("#menu-btn").addEventListener("click", () => $("#sidebar").classList.add("is-open"));
  $("#sidebar-close").addEventListener("click", () => $("#sidebar").classList.remove("is-open"));
  $("#presence-toggle").addEventListener("click", () => $("#presence").classList.toggle("is-open"));
  $("#model-pill").addEventListener("click", () => showView("settings"));
  $("#setup-settings").addEventListener("click", () => showView("settings"));
  $("#copy-ollama").addEventListener("click", async () => {
    const command = "ollama pull llama3.1:8b && ollama serve";
    try {
      await navigator.clipboard.writeText(command);
      toast("Local model command copied.");
    } catch {
      toast(command);
    }
  });

  $("#new-chat").addEventListener("click", () => {
    state.abort?.abort();
    newThread(true);
    renderTranscript();
    showView("chat");
    $("#prompt").focus();
  });

  $("#clear-threads").addEventListener("click", () => {
    if (!state.threads.length) return;
    if (!confirm("Clear the thread list from this browser? Memories and knowledge are untouched.")) return;
    state.threads = [];
    state.currentId = null;
    saveThreads();
    renderThreads();
    renderTranscript();
    updateCounts();
  });

  $("#composer").addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage($("#prompt").value);
  });
  $("#prompt").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage($("#prompt").value);
    }
  });
  $("#prompt").addEventListener("input", resizePrompt);

  $$(".quick").forEach((btn) =>
    btn.addEventListener("click", () => {
      showView("chat");
      $("#prompt").value = btn.dataset.quick || "";
      resizePrompt();
      $("#prompt").focus();
    }),
  );

  $("#memory-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = $("#memory-text").value.trim();
    if (!text) return;
    try {
      await api.addMemory(text, $("#memory-kind").value);
      $("#memory-text").value = "";
      await loadMemory();
      toast("Kept. She will carry it.");
    } catch (error) {
      toast(error.message || "Could not keep that memory.", true);
    }
  });
  let memoryTimer;
  $("#memory-search").addEventListener("input", (event) => {
    clearTimeout(memoryTimer);
    memoryTimer = setTimeout(() => loadMemory(event.target.value.trim()), 220);
  });

  $("#add-knowledge").addEventListener("click", () => openKnowledgeModal("general"));
  $$(".import-pack").forEach((btn) => btn.addEventListener("click", () => openKnowledgeModal(btn.dataset.pack)));
  $("#save-persona").addEventListener("click", savePersona);

  $("#save-settings").addEventListener("click", saveSettings);
  $("#copy-host").addEventListener("click", async () => {
    const command = "HOST=0.0.0.0 AGENT_ACCESS_TOKEN=change-me npm run agent";
    try {
      await navigator.clipboard.writeText(command);
      toast("Host command copied. Put HTTPS in front of it.");
    } catch {
      toast(command);
    }
  });
  $("#export-data").addEventListener("click", exportData);
  $("#download-agent").addEventListener("click", () => window.open(DOWNLOAD_URL, "_blank", "noopener"));

  $("#voice-toggle").addEventListener("click", () => {
    state.voice = !state.voice;
    $("#voice-toggle").classList.toggle("is-on", state.voice);
    toast(state.voice ? "She will speak her replies aloud." : "Spoken replies off.");
    if (!state.voice) speechSynthesis.cancel();
  });
  $("#mic").addEventListener("click", toggleDictation);

  $("#studio-form").addEventListener("submit", composeStudio);
  $("#copy-studio").addEventListener("click", async () => {
    const text = $("#studio-result").innerText;
    try {
      await navigator.clipboard.writeText(text);
      toast("Treatment copied.");
    } catch {
      toast("Clipboard unavailable.", true);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      $("#sidebar").classList.remove("is-open");
      $("#presence").classList.remove("is-open");
    }
  });
}


/* ── Studio ──────────────────────────────────────────────── */
async function composeStudio(event) {
  event.preventDefault();
  if (state.streaming) return;
  const idea = $("#studio-idea").value.trim();
  if (!idea) return;
  const duration = $("#studio-duration").value;
  const aspect = $("#studio-aspect").value;
  const style = $("#studio-style").value.trim();
  const brief = `Create a ${duration} ${aspect} film treatment.\n\nSubject / feeling: ${idea}\nVisual language: ${style}\n\nReturn: (1) a one-line logline, (2) a directing concept, (3) a beat-by-beat script for the duration, (4) a numbered shot list with lens, movement, light and sound, (5) image-generation prompts for each key frame, (6) an edit and sound note. Be specific and production-ready. Consult the imported Phani V9 playbook if it is present.`;

  const result = $("#studio-result");
  result.classList.remove("empty-note");
  result.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  state.abort = new AbortController();
  try {
    let content = "";
    await streamChat(
      [{ role: "user", content: brief }],
      (ev) => {
        if (ev.type === "delta") {
          content += ev.text ?? ev.delta ?? ev.content ?? "";
          result.innerHTML = renderMarkdown(content);
        } else if (ev.type === "error") {
          content += `\n\n_${ev.error || ev.message}_`;
          result.innerHTML = renderMarkdown(content);
        }
      },
      { signal: state.abort.signal, mode: "studio" },
    );
    if (!content) result.innerHTML = `<p class="empty-note">No treatment returned. Check the model in Settings.</p>`;
    toast("Treatment composed.");
  } catch (error) {
    result.innerHTML = `<p class="empty-note">${escape(friendlyError(error))}</p>`;
    toast(error.message || "Studio could not reach a model.", true);
  } finally {
    state.abort = null;
  }
}

/* ── Voice ───────────────────────────────────────────────── */
function toggleDictation() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast("This browser does not offer dictation. Chrome or Edge does.", true);
    return;
  }
  if (state.recognition) {
    state.recognition.stop();
    state.recognition = null;
    $("#mic").classList.remove("is-on");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = navigator.language || "en-IN";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let text = "";
    for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript;
    $("#prompt").value = text;
    resizePrompt();
  };
  recognition.onerror = () => {
    toast("Dictation stopped.", true);
    $("#mic").classList.remove("is-on");
    state.recognition = null;
  };
  recognition.onend = () => {
    $("#mic").classList.remove("is-on");
    state.recognition = null;
    $("#prompt").focus();
  };
  recognition.start();
  state.recognition = recognition;
  $("#mic").classList.add("is-on");
  toast("Listening…");
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const plain = String(text)
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/[*_#>`|]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(plain.slice(0, 1200));
  const voices = speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /female|samantha|serena|priya|veena|zira|aria/i.test(v.name) && /en/i.test(v.lang)) ||
    voices.find((v) => /en-IN/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang));
  if (preferred) utterance.voice = preferred;
  utterance.rate = 0.96;
  utterance.pitch = 1.02;
  speechSynthesis.speak(utterance);
}

/* ── Export ──────────────────────────────────────────────── */
async function exportData() {
  try {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/export", { headers });
    if (res.ok) {
      const blob = await res.blob();
      downloadBlob(blob, `radha-export-${new Date().toISOString().slice(0, 10)}.json`);
      toast("Your archive is ready.");
      return;
    }
    const bundle = {
      exportedAt: new Date().toISOString(),
      persona: state.persona,
      memories: state.memories,
      knowledge: state.knowledge,
      threads: state.threads,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    downloadBlob(blob, `radha-export-${new Date().toISOString().slice(0, 10)}.json`);
    toast("Your archive is ready.");
  } catch (error) {
    toast(error.message || "Could not export data.", true);
  }
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

boot();

