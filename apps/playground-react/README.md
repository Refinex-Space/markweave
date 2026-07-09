# React Playground

Private Vite/React playground for checking the `@markweave/react` adapter against the shared editor behavior.

## Run

```sh
pnpm --filter @markweave/playground-react dev
```

Open `http://127.0.0.1:5173/`.

## What It Covers

- Shared Markdown fixture from `@markweave/playground-fixtures`.
- Live/View mode switching.
- Floating toolbar, slash commands, tables, media, code blocks, Mermaid, math, and inner TOC.
- Upload mock, table callbacks, and AI callback debug surfaces.

## Integration Shape

The playground aliases `@markweave/react`, `markweave`, `markweave/internal/*`, and `markweave/styles.css` to local source files so adapter changes can be inspected without publishing a package. Published consumers should install `@markweave/react`, import from `@markweave/react`, and import `@markweave/react/styles.css` once in their app entry.
