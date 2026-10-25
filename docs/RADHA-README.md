# Radha — a local-first AI companion

**Radha** is a private, capable AI agent that lives on your laptop and can move to a cloud server when you need her there. She has long-term memory, a curated knowledge brain, file and web tools, voice, a video studio, and an optional cloud fallback. Her visual language is drawn from the maroon-and-gold portrait you shared; the artwork in this project is an original illustration, not a copy.

- **Download:** [radha-agent-v1.0.0.zip](https://github.com/Felixtheloafer/Vrindavan2/releases/download/radha-agent-v1.0.0/radha-agent-v1.0.0.zip)
- **Source:** [github.com/Felixtheloafer/Vrindavan2](https://github.com/Felixtheloafer/Vrindavan2)
- **Runs on:** Linux, macOS or Windows with Node.js 20+
- **Cost:** free with a local model; cloud usage is billed by whichever provider you connect

> **About the Phani V3 and V9 links:** those ChatGPT projects are private. Their URLs return HTTP 403 to everyone except your signed-in account, so no software can import them directly. Radha ships with a proper **import pipeline** instead: open each project in ChatGPT, copy its instructions and notes (or export the files), then use **Brain & Knowledge → Import V3 / Import V9**. Those pages become part of her local brain and are consulted before she answers.

---

## 1. Start her in two minutes

### Option A — the downloaded folder (recommended)

```bash
unzip radha-agent-v1.0.0.zip
cd radha-agent
./start.sh          # macOS / Linux
```

On Windows, double-click `start.bat`. Then open **http://127.0.0.1:8787**.

No `npm install` is needed. The agent has **zero runtime dependencies** — just Node.js.

To install a `radha` command and desktop-friendly launcher:

```bash
./install.sh
radha
```

### Option B — from this repository

```bash
npm run agent
```

Open **http://127.0.0.1:8787**. The 3D Vrindavan game remains a separate experience: `npm run dev`.

---

## 2. Give her a local mind (fully offline)

Radha does not ship a model; models are large and you should choose your own. She auto-detects the common local runtimes.

### Ollama (easiest)

```bash
# install from https://ollama.com, then:
ollama pull llama3.1:8b
ollama serve
```

Radha checks `http://127.0.0.1:11434` automatically. A good laptop model is `llama3.1:8b` (8 GB RAM) or `qwen2.5:7b`. With 16 GB+ RAM, `qwen2.5:14b` or `gemma2:9b` are stronger. On a small machine, `llama3.2:3b` is usable.

### LM Studio

1. Load a model in LM Studio.
2. Start the local server (Developer tab) on port `1234`.
3. In Radha: **Settings → Local provider → LM Studio**, base URL `http://127.0.0.1:1234`, model name exactly as shown in LM Studio.

### llama.cpp

Run `llama-server` with an OpenAI-compatible endpoint (usually port `8080`), then choose **llama.cpp** in Settings.

Once a local model answers, the indicator turns green. **No prompt, memory, file, or key leaves the machine.**

---

## 3. Or lend her a cloud mind

Cloud is optional and used only when you configure it. In **Settings → Cloud fallback** choose:

| Provider | Model examples | Notes |
| --- | --- | --- |
| OpenAI | `gpt-4o-mini`, `gpt-4.1` | general strength |
| OpenRouter | any listed model | one key, many models |
| Groq | `llama-3.3-70b-versatile` | very fast |
| Anthropic | `claude-sonnet-4-5` | careful long-form work |
| Google Gemini | `gemini-2.0-flash` | long context |

Paste the key and save. It is written to `data/config.json` on the server with `0600` permissions and **never sent to the browser**. The browser only sees `hasKey: true` and a masked hint.

With **Local first** enabled, Radha tries the local mind first and falls back to cloud only when the local one is unavailable. Disable it to force cloud, or remove the key to force local. With Wi-Fi off and a local model installed, she keeps working.

---

## 4. What she can actually do

### A brain with rooms

- **Identity** — an editable persona (`data/persona.md`) with warmth, directness and honest limits.
- **Curated knowledge** — V3/V9 imports and any notes you add, loaded within a context budget and ranked by relevance.
- **Long-term memory** — facts, preferences, projects and promises stored as inspectable JSONL. She can search it, add to it, and you can delete any entry.
- **Working memory** — the recent conversation, trimmed sensibly.
- **Reflection** — a bounded tool loop: she can look something up, read a file, then answer, up to six rounds.

### Tools

| Tool | What it does | Guardrail |
| --- | --- | --- |
| `memory_search` / `memory_add` | recall and keep facts | local JSONL only |
| `workspace_list` / `workspace_read` / `workspace_search` | work with your notes and code | confined to `data/workspace` |
| `workspace_write` | create or replace a file | size cap, path confinement |
| `web_fetch` | read a public page | http/https only; private and loopback addresses refused |
| `clock` | date and time | local clock |

There is deliberately **no shell execution tool**. An LLM should not have unattended `rm -rf` powers on your laptop. If you need command execution, run the command yourself after she proposes it.

### Studio (the V9 room)

The Studio turns a brief into a logline, directing concept, timed script, shot list with lens/movement/light/sound, image-generation prompts and edit notes. Import your V9 playbook first and her treatments will follow your own grammar instead of generic advice.

### Voice and presence

- Dictation uses your browser's speech recognition (Chrome/Edge).
- Spoken replies use the best local system voice available.
- The portrait, palette and typography are part of the interface, not a claim that she is a person.

---

## 5. Importing the Phani brain (V3) and video playbook (V9)

1. Sign in to ChatGPT and open your **AI Brain** project.
2. Open the project's instructions/notes. Copy the text, or download the files you want her to know.
3. In Radha, go to **Brain & Knowledge**.
4. Click **Import V3**. Paste the instructions, or select exported `.md`, `.txt`, `.json` or `.csv` files. Press **Import**.
5. Repeat with **Import V9** for the AI Video project.
6. Ask her something that requires the playbook. The pages are retrieved and cited by name when relevant.

You can add more pages at any time with **Add a page**, and remove them with the `×` beside each one. Imported text is stored under `data/knowledge/` on your machine. Nothing is uploaded anywhere by the import itself.

If a project has a very long instruction set, split it into thematic pages (identity, reasoning rules, research workflow, video pipeline, prompt templates). Smaller pages retrieve more precisely.

---

## 6. Put her on a cloud server

Radha is a normal Node.js service. On a small VPS:

```bash
git clone https://github.com/Felixtheloafer/Vrindavan2.git
cd Vrindavan2
HOST=0.0.0.0 PORT=8787 AGENT_ACCESS_TOKEN='a-long-random-secret' npm run agent
```

Or with Docker (the image includes no dependencies and refuses to run unauthenticated):

```bash
AGENT_ACCESS_TOKEN='a-long-random-secret' docker compose up -d --build
```

The container listens on `127.0.0.1:8787` on the host (safe for a reverse proxy) and keeps `./data` on a volume.

Then put HTTPS in front of it. A minimal Caddyfile:

```caddyfile
radha.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Or Nginx, with `proxy_buffering off;` so SSE streams smoothly.

Security rules that matter:

- **Always set `AGENT_ACCESS_TOKEN`** when the bind address is not loopback. The server refuses unauthenticated access beyond localhost.
- Use HTTPS. The token and messages are otherwise visible on the network.
- Do not publish port `8787` directly to the internet.
- Back up `data/` — it contains your memories, knowledge and config (including cloud keys).
- On a cloud box, point **Settings → Local base URL** at a local Ollama instance on that server, or use a cloud provider key. Ollama on your laptop is not reachable from the VPS by default.

The browser access token is entered once when prompted and stored in that browser's local storage. The server compares it in constant time.

---

## 7. Your data, and how to leave

Everything lives in `data/` beside the app:

```
data/
  persona.md          her editable character and rules
  memory.jsonl        append-only memories
  knowledge/          imported pages (V3, V9, general)
  workspace/          the only folder her file tools may touch
  config.json         provider settings and cloud keys (0600)
```

Threads live in your browser's local storage unless you export them. The server stores only memory, knowledge, persona and configuration.

Docker users can keep the whole `data/` directory as a volume to carry her memory between laptop and server. Copy it while the server is stopped.

- **Export my data** downloads a JSON archive.
- Delete a memory in **Memory**; delete a knowledge page in **Brain & Knowledge**.
- Delete `data/` to start completely fresh.
- Uninstalling is deleting the folder. There is no account and no telemetry.

Cloud providers receive the prompt and context you send them, subject to their own policies. Local models receive nothing beyond your machine. This is the honest trade: cloud is stronger; local is sovereign.

---

## 8. Architecture

```
agent/                 browser app (vanilla ES modules, no build step)
  index.html           chat, memory, brain, studio, settings
  assets/app.js        UI, streaming, voice, local thread store
  assets/api.js        SSE client; keys never handled here
  assets/markdown.js   dependency-free, escaped Markdown renderer
  assets/radha.svg     original portrait illustration
server/                Node.js service, zero dependencies
  index.js             HTTP server, auth, static files, SSE
  providers/           Ollama, OpenAI-compatible, Anthropic, Gemini
  memory.js            local memory store and retrieval
  knowledge.js         import, sanitiser, relevance budget
  tools.js             workspace, memory, web fetch, clock
  data/persona.md           default character
  docs/RADHA-README.md      this guide
  scripts/package-agent.mjs builds the downloadable archive
```

The browser and server speak a small JSON/SSE protocol. You can replace the UI, call the API from another tool, or run the server headless. The agent does not depend on a proprietary backend or a hosted vector database.

---

## 9. Troubleshooting

**"No model is configured yet."** Start Ollama (`ollama serve`) or configure a cloud key, then press the status pill and save settings.

**"The local server is not answering."** You opened the HTML file directly. Use `./start.sh` / `npm run agent` and the `http://127.0.0.1:8787` URL.

**Ollama is running but Radha says local is offline.** Check the model name. `ollama list` must show it exactly. On a different port, change the local base URL.

**The model is slow.** Use a smaller quantisation, close other memory-heavy apps, or switch to a cloud provider for that task. 7–8B models are the practical laptop sweet spot.

**Streaming stalls behind a proxy.** Disable response buffering (`proxy_buffering off` in Nginx; Caddy streams by default).

**V3/V9 import shows nothing.** The links are private; copy the content from your signed-in ChatGPT session. A 403 response is expected and is not a bug in Radha.

**Voice does not work.** Dictation needs Chrome or Edge and microphone permission. Spoken replies need a system voice installed.

**Forgot the access token.** Restart the server with a new `AGENT_ACCESS_TOKEN` and enter it when prompted.

---

## 10. Design principles

1. **Local by default.** A cloud key is an option, never a requirement.
2. **Inspectable memory.** No hidden profile, no opaque embeddings you cannot delete.
3. **Bounded agency.** Tools are useful, confined, and never include a shell.
4. **Honest presence.** She is warm, but she will not pretend to be human or to have read something she cannot access.
5. **Portable.** One folder, one Node process, your data in plain files.

Radha is yours. Change her persona, give her your frameworks, teach her your taste.

*Portrait and interface are original work created for this project, inspired by the supplied reference image.*

