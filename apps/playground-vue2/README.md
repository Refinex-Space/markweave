# Vue 2 Playground

Private Vue CLI 4 / Webpack 4 / Vue 2.6 minimum-baseline playground for checking the `@markweave/vue2` adapter against shared editor behavior.

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
- Webpack stats verification for one Vue/Tiptap/ProseMirror runtime root and bounded output sizes.
- Real packed-package matrix verification through `pnpm verify:vue2-packed` for Vue 2.6.12 / Vue CLI 4.4.6 and Vue 2.7.16 / Vue CLI 4.5.19.

## Integration Shape

`src/MarkweaveEditorPlayground.vue` is a normal Vue single-file component using `<template>` plus Vue 2 Options API `<script>`, matching the shape published consumers are expected to copy into Vue CLI 4 / Webpack 4 projects.

The playground aliases `@markweave/vue2`, `markweave`, `markweave/internal/*`, and `markweave/styles.css` to local source files so adapter changes can be inspected without publishing a package. Published consumers should install `@markweave/vue2`, import from `@markweave/vue2`, and import `@markweave/vue2/styles.css` once in their app entry.

`MARKWEAVE_VUE2_LEGACY=1` switches the production build to generated package artifacts instead of source aliases. Run the root `pnpm build:vue2-legacy` command rather than setting this variable manually so both publishable packages are rebuilt before the fixture consumes them.

This workspace fixture is intentionally the minimum matrix. It is not the tarball-isolation proof; `pnpm verify:vue2-packed` creates temporary strict-pnpm consumers, installs actual tarballs, validates singleton stats, and runs a deterministic browser smoke for both minimum and final Vue 2 matrices.
