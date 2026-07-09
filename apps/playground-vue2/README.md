# Vue 2 Playground

Private Vue CLI 4 / Webpack 4 / Vue 2.6 playground for checking the `markweave/vue2` adapter against the shared editor behavior and a legacy bundler baseline.

## Run

```sh
pnpm --filter @markweave/playground-vue2 dev
```

Open `http://127.0.0.1:5175/`.

## What It Covers

- Shared Markdown fixture from `@markweave/playground-fixtures`.
- Live/View mode switching.
- Floating toolbar, slash commands, tables, media, code blocks, Mermaid, math, and inner TOC.
- Upload mock, table callbacks, and AI callback debug surfaces.
- Webpack 4 aliases and `transpileDependencies` needed by the legacy Vue CLI toolchain.

## Integration Shape

The playground aliases `markweave`, `markweave/vue2`, and `markweave/styles.css` to local source files so adapter changes can be inspected without publishing a package. Published consumers should install `markweave` plus the Vue 2 peers documented in the root README, then import from `markweave/vue2`.
