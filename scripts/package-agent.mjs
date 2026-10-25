#!/usr/bin/env node
// Build a self-contained, dependency-free Radha agent archive.
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "1.0.0";
const name = `radha-agent-v${version}`;
const stageRoot = path.join(root, ".release");
const stage = path.join(stageRoot, "radha-agent");
const releases = path.join(root, "releases");

const skip = new Set(["node_modules", ".git", "releases", ".release", "dist", "data"]);
const skipFile = (file) =>
  file === "config.json" ||
  file.endsWith(".test.js") ||
  file.endsWith(".log") ||
  file.startsWith(".") && file !== ".gitignore";

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (skip.has(entry.name) || skipFile(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else if (entry.isFile()) await fs.copyFile(from, to);
  }
}

async function write(file, content, mode) {
  const target = path.join(stage, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  if (mode) await fs.chmod(target, mode);
}

async function main() {
  await fs.rm(stageRoot, { recursive: true, force: true });
  await fs.mkdir(stage, { recursive: true });

  await copyDir(path.join(root, "agent"), path.join(stage, "agent"));
  await copyDir(path.join(root, "server"), path.join(stage, "server"));
  for (const file of ["Dockerfile", "docker-compose.yml"]) {
    await fs.copyFile(path.join(root, file), path.join(stage, file)).catch(() => {});
  }

  await write(
    "package.json",
    `${JSON.stringify(
      {
        name: "radha-agent",
        version,
        private: true,
        type: "module",
        description: "Radha — a local-first AI companion with memory, tools and an optional cloud mind.",
        engines: { node: ">=20" },
        scripts: {
          start: "node server/index.js",
          agent: "node server/index.js",
        },
      },
      null,
      2,
    )}\n`,
  );

  const readme = await fs.readFile(path.join(root, "docs", "RADHA-README.md"), "utf8").catch(() => "");
  await write("README.md", readme || "# Radha\n\nRun `./start.sh` or `npm start`.\n");

  await write(
    "start.sh",
    `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Radha needs Node.js 20 or newer: https://nodejs.org" >&2
  exit 1
fi
MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$MAJOR" -lt 20 ]; then
  echo "Radha needs Node.js 20 or newer (found $(node -v))." >&2
  exit 1
fi
PORT="\${PORT:-8787}"
export PORT
URL="http://127.0.0.1:\${PORT}"
( sleep 1.2; if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true; elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true; fi ) &
echo "Radha is waking at $URL"
exec node server/index.js
`,
    0o755,
  );

  await write(
    "start.bat",
    `@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul || (echo Radha needs Node.js 20 or newer: https://nodejs.org & pause & exit /b 1)\r\nstart "Radha Agent" cmd /k "node server/index.js"\r\ntimeout /t 2 /nobreak >nul\r\nstart "" http://127.0.0.1:8787\r\n`,
  );

  await write(
    "install.sh",
    `#!/usr/bin/env bash
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="\${RADHA_HOME:-$HOME/.local/share/radha-agent}"
BIN="\${RADHA_BIN:-$HOME/.local/bin}"
mkdir -p "$DEST" "$BIN"
if [ -d "$DEST/data" ]; then
  echo "Keeping your existing memories and settings in $DEST/data"
  rm -rf "$DEST/agent" "$DEST/server"
fi
cp -a "$SRC/agent" "$SRC/server" "$SRC/start.sh" "$SRC/README.md" "$SRC/package.json" "$DEST/"
[ -d "$DEST/data" ] || cp -a "$SRC/data" "$DEST/data" 2>/dev/null || true
chmod +x "$DEST/start.sh"
ln -sf "$DEST/start.sh" "$BIN/radha"
echo "Installed. Start Radha from anywhere with: radha"
echo "Files live in: $DEST"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Add $BIN to your PATH to use the 'radha' command." ;; esac
`,
    0o755,
  );

  // Seed files only; never ship a real config or personal data.
  await write(
    "data/workspace/README.md",
    "# Radha's workspace\n\nThis folder is the only place she may read and write through her tools. Drop notes, drafts and references here. Everything stays on this machine.\n",
  );
  await write(
    "data/knowledge/README.md",
    "# Knowledge\n\nImport private Phani V3 (AI Brain) and V9 (AI Video) exports through Brain & Knowledge in the app. Markdown, text and JSON pages are indexed locally.\n",
  );
  const personaPath = path.join(root, "server", "persona.md");
  const persona = await fs.readFile(personaPath, "utf8").catch(() => null);
  if (persona) await write("data/persona.md", persona);
  await write("data/.gitignore", "config.json\nconversations/\nworkspace/*\n!workspace/README.md\n");

  await fs.mkdir(releases, { recursive: true });
  const zipPath = path.join(releases, `${name}.zip`);
  await fs.rm(zipPath, { force: true });
  execFileSync("zip", ["-qr", zipPath, "radha-agent"], { cwd: stageRoot });

  const { size } = await fs.stat(zipPath);
  const digest = (await import("node:crypto"))
    .createHash("sha256")
    .update(await fs.readFile(zipPath))
    .digest("hex");
  await fs.writeFile(`${zipPath}.sha256`, `${digest}  ${name}.zip\n`);
  console.log(`Built ${zipPath}`);
  console.log(`Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`SHA-256: ${digest}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
