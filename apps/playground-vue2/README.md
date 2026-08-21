# Vue 2 Playground

Private Vue CLI 4 / Webpack 4 / Vue 2.6 playground for checking the `@markweave/vue2` adapter against the shared editor behavior and a legacy bundler baseline.

## Run

```sh
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY locally.
pnpm --filter @markweave/playground-vue2 dev
```

Open `http://127.0.0.1:5175/`.

## What It Covers

- Shared Markdown fixture from `@markweave/playground-fixtures`.
- Live/View mode switching.
- Floating toolbar, slash commands, tables, media, code blocks, Mermaid, math, and inner TOC.
- Upload mock, table callbacks, and AI callback debug surfaces.
- Real text and table Ask AI streaming through the local `/api/markweave/ask-ai` development proxy, including exact-shape GFM table prompts. The API key stays in the root `.env` and is never exposed through `VUE_APP_*` client variables.
- Webpack 4 aliases and `transpileDependencies` needed by the legacy Vue CLI toolchain.
- Published ES2019 package consumption through `pnpm build:vue2-legacy`, including the `@markweave/vue2/webpack4` helper and persistent Babel cache.

## Integration Shape

`src/MarkweaveEditorPlayground.vue` is a normal Vue single-file component using `<template>` plus Vue 2 Options API `<script>`, matching the shape published consumers are expected to copy into Vue CLI 4 / Webpack 4 projects.

The playground aliases `@markweave/vue2`, `markweave`, `markweave/internal/*`, and `markweave/styles.css` to local source files so adapter changes can be inspected without publishing a package. Published consumers should install `@markweave/vue2`, import from `@markweave/vue2`, and import `@markweave/vue2/styles.css` once in their app entry.

`MARKWEAVE_VUE2_LEGACY=1` switches the production build to generated package artifacts instead of source aliases. Run the root `pnpm build:vue2-legacy` command rather than setting this variable manually so both publishable packages are rebuilt before the fixture consumes them.
