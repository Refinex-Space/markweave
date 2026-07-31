# Vue 3 Playground

Private Vite/Vue 3 playground for checking the `@markweave/vue3` adapter against the shared editor behavior.

## Run

```sh
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY locally.
pnpm --filter @markweave/playground-vue3 dev
```

Open `http://127.0.0.1:5174/`.

## What It Covers

- Shared Markdown fixture from `@markweave/playground-fixtures`.
- Live/View mode switching.
- Floating toolbar, slash commands, tables, media, code blocks, Mermaid, math, and inner TOC.
- Upload mock, table callbacks, and AI callback debug surfaces.
- Real text and table Ask AI streaming through the local `/api/markweave/ask-ai` development proxy, including exact-shape GFM table prompts. The API key stays in the root `.env` and is never exposed through Vite client variables.

## Integration Shape

`src/MarkweaveEditorPlayground.vue` is a normal Vue single-file component using `<template>` plus `<script setup lang="ts">`, matching the shape published consumers are expected to copy into Vue 3 projects.

The playground aliases `@markweave/vue3`, `markweave`, `markweave/internal/*`, and `markweave/styles.css` to local source files so adapter changes can be inspected without publishing a package. Published consumers should install `@markweave/vue3`, import from `@markweave/vue3`, and import `@markweave/vue3/styles.css` once in their app entry.
