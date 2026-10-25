# Vrindavan

Two experiences live here:

## Radha — your local-first AI agent

A private, capable companion with long-term memory, a Phani-style knowledge brain, workspace and web tools, voice, and a video studio. She runs on your laptop with Ollama, LM Studio or llama.cpp, and can use an optional cloud mind when Wi-Fi is available.

**[Download Radha v1.0.0](https://github.com/Felixtheloafer/Vrindavan2/releases/download/radha-agent-v1.0.0/radha-agent-v1.0.0.zip)** · [Full guide](docs/RADHA-README.md)

```bash
npm run agent   # open http://127.0.0.1:8787
```

No install step beyond Node.js 20+. The download is a self-contained folder with `start.sh` / `start.bat`. The private ChatGPT project links for Phani V3 and V9 cannot be read by any external app; Radha provides an import flow for their exported instructions and files in **Brain & Knowledge**.

---

## Vrindavan: The Living Garden (3D game)

A browser-based, Van Gogh-inspired 3D exploration game. Walk the painted lanes of a stylized Vrindavan: temples, a flower market, the Yamuna ghat, a small forest, cows, monkeys, kirtan, festivals, and rare quiet miracles.

### Play

```bash
npm install
npm run dev
```

Open the local Vite URL, click **Play** (cinematic dawn) or **Explore** (immediate control). Click the canvas to lock the mouse.

## Controls

| Key | Action |
| --- | --- |
| WASD | Walk |
| Shift | Sprint |
| Space | Jump |
| Mouse | Look |
| E | Interact |
| C | Third / first person |
| P | Photo mode (click to save) |
| M | Illustrated map |
| J | Journal |
| 1–4 | Emotes |
| Esc | Menu |

## MVP slice

One dense street, one temple, market stalls, riverside ghat, forest shrine and hidden garden, living NPCs and animals, adaptive positional audio, day/night, weather, festival calendar, discovery journal, gentle quests, and a rare Krishna encounter at dusk in the trees.

Quality presets: LOW / MEDIUM / HIGH / ULTRA (Settings; reload after changing).

The world is built from reusable painterly meshes and shaders so streets, temples, animals, and festivals can grow without changing the art language.
