# Vue 3 Playground

Private Vite/Vue 3 playground for checking the `markweave/vue3` adapter against the shared editor behavior.

## Run

```sh
pnpm --filter @markweave/playground-vue3 dev
```

Open `http://127.0.0.1:5174/`.

## What It Covers

- Shared Markdown fixture from `@markweave/playground-fixtures`.
- Live/View mode switching.
- Floating toolbar, slash commands, tables, media, code blocks, Mermaid, math, and inner TOC.
- Upload mock, table callbacks, and AI callback debug surfaces.

## Integration Shape

`src/MarkweaveEditorPlayground.vue` is a normal Vue single-file component using `<template>` plus `<script setup lang="ts">`, matching the shape published consumers are expected to copy into Vue 3 projects.

The playground aliases `markweave`, `markweave/vue3`, and `markweave/styles.css` to local source files so adapter changes can be inspected without publishing a package. Published consumers should install `markweave` plus the Vue 3 peers documented in the root README, import from `markweave/vue3`, and import `markweave/styles.css` once in their app entry.
