# React Playground

Private Vite/React playground for checking the `@markweave/react` adapter against the shared editor behavior.

## Run

```sh
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY locally.
pnpm --filter @markweave/playground-react dev
```

Open `http://127.0.0.1:5173/`.

## What It Covers

- Shared Markdown fixture from `@markweave/playground-fixtures`.
- Live/View mode switching.
- Floating toolbar, slash commands, tables, media, code blocks, Mermaid, math, and inner TOC.
- Upload mock, table callbacks, AI callback debug surfaces, and a deterministic whole-document multi-hunk review trigger for navigation and per-hunk decision checks.
- Real text and table Ask AI streaming through the local `/api/markweave/ask-ai` development proxy, including exact-shape GFM table prompts. The API key stays in the root `.env` and is never exposed through Vite client variables.

## Integration Shape

The playground aliases `@markweave/react`, `markweave`, `markweave/internal/*`, and `markweave/styles.css` to local source files so adapter changes can be inspected without publishing a package. Published consumers should install `@markweave/react`, import from `@markweave/react`, and import `@markweave/react/styles.css` once in their app entry.
