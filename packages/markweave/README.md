# markweave

Markdown-first WYSIWYG editor built on Tiptap and CodeMirror, providing Typora-like editing experience with block-level structure, slash commands, and rich text tooling.

Full guides:

- React: [English](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/react-integration.md) | [中文](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/react-integration-zh-cn.md)
- Vue 3: [English](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue3-integration.md) | [中文](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue3-integration-zh-cn.md)
- Vue 2: [English](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue2-integration.md) | [中文](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue2-integration-zh-cn.md)

## Install

Install one Markweave adapter package in an existing framework app. React or Vue itself remains owned by the host app.

### React

```sh
pnpm add @markweave/react
```

### Vue 3

```sh
pnpm add @markweave/vue3
```

### Vue 2

```sh
pnpm add @markweave/vue2
```

Vue 2 CLI / Webpack 4 projects should keep `vue-template-compiler` on the same Vue 2.6.x version as `vue`. Existing Vue 2 CLI projects usually already have both.

## Usage

### React

```tsx
import { MarkweaveEditor } from "@markweave/react";
import "@markweave/react/styles.css";

export function Editor() {
  return (
    <MarkweaveEditor
      defaultContent={"# Hello Markweave\n\nStart writing in **Markdown**."}
      mode="live"
      onUpdate={({ markdown }) => console.log(markdown)}
    />
  );
}
```

### Vue 3

```vue
<script setup lang="ts">
import { MarkweaveEditor } from "@markweave/vue3";
import "@markweave/vue3/styles.css";

function handleUpdate({ markdown }: { markdown: string }) {
  console.log(markdown);
}
</script>

<template>
  <MarkweaveEditor
    default-content="# Hello Markweave\n\nStart writing in **Markdown**."
    mode="live"
    :on-update="handleUpdate"
  />
</template>
```

### Vue 2

Vue CLI 4 / Webpack 4 projects must install `vue-template-compiler` with the same `2.6.x` version as Vue.

```vue
<template>
  <MarkweaveEditor
    default-content="# Hello Markweave\n\nStart writing in **Markdown**."
    mode="live"
    :on-update="handleUpdate"
  />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";
import "@markweave/vue2/styles.css";

export default {
  name: "Editor",
  components: { MarkweaveEditor },
  methods: {
    handleUpdate({ markdown }) {
      console.log(markdown);
    },
  },
};
</script>
```

You can import the adapter `styles.css` once in the app entry instead of inside each component. If you explicitly install the core `markweave` package or use legacy subpath imports, `markweave/styles.css` remains available.

`defaultContent` and controlled `content` are Markdown by default. Use `defaultContentFormat="html"` or `contentFormat="html"` when migrating an existing HTML integration. `onUpdate.markdown` is the recommended storage output; `html`, `json`, and `text` remain available.

`mode` defaults to `"live"`. Use `mode="view"` for a read-only rendered view. `editable={false}` remains a compatibility lock, including when `mode="live"`.

Math formulas are editable in Live mode: click inline `$...$` or display `$$...$$` formulas to open the in-place LaTeX editor. View mode keeps formulas read-only while preserving the rendered layout.

`innerToc` defaults to `true` and shows a built-in right-side outline derived from document headings. `innerTocPlacement` defaults to `"container"`, which keeps the outline vertically centered in the visual viewport and centers the writing column with symmetric TOC gutters. The built-in outline hides automatically when the actual editor container is narrow, preserving readable document width. Set `innerTocPlacement="viewport"` only when a fixed viewport-side outline is required; set `innerToc={false}` when rendering your own outline from `onTocChange` or `runtimeSnapshot.toc`.

Markweave 0.2.3 exports `createMarkweaveSearchController` and the shared `MarkweaveSearch` extension. The default extension bundle already registers it. Controllers support Unicode-aware literal and regex queries, case and whole-word options, cyclic navigation, ProseMirror result decorations, subscriptions, and editable-only replacement.

## Code Block Languages

Markweave 0.2.2 shares one searchable language catalog across all adapters. It includes XML, Properties, INI, TOML, JSON variants, YAML, Dockerfile, Nginx, HTTP, GraphQL, Protocol Buffers, JavaScript/JSX, TypeScript/TSX, Java, Kotlin, Scala, C/C++/C#, Go, Rust, Python, Ruby, PHP, Swift, Dart, shell languages, SQL variants, and additional template, functional, scientific, and infrastructure languages.

Every selectable language identifier is registered with either a dedicated Highlight.js grammar or a compatible grammar. Stored Markdown fence identifiers are preserved. Compatibility groups cover JavaScript (`js`, `jsx`), TypeScript (`ts`, `tsx`), XML-derived HTML identifiers, JSON variants, shell variants, TOML/INI, PostCSS/CSS, PL/SQL/SQL, and Vyper/Python. Plain text has no token coloring. Mermaid defaults to Preview, while slash-inserted Mermaid opens in Code mode for immediate source editing.

## Framework Parity

| Capability | React | Vue 3 | Vue 2 |
| --- | --- | --- | --- |
| Markdown input/output | Yes | Yes | Yes |
| Live/View mode | Yes | Yes | Yes |
| Floating toolbar | Yes | Yes | Yes |
| Slash command menu | Yes | Yes | Yes |
| Tables and clipboard callbacks | Yes | Yes | Yes |
| Image/video/attachment rendering | Yes | Yes | Yes |
| Code blocks and Mermaid | Yes | Yes | Yes |
| Math editing/rendering | Yes | Yes | Yes |
| Inner TOC | Yes | Yes | Yes |
| Upload and AI callbacks | Yes | Yes | Yes |

## Exports

- `markweave`: framework-neutral types and helpers, including content format, mode, lang, TOC, upload, and table payload types.
- `@markweave/react`: React editor component, controller hook, React extension factory, and `@markweave/react/styles.css`.
- `@markweave/vue2`: Vue 2 editor component, controller helper, Vue 2 extension factory, and `@markweave/vue2/styles.css`.
- `@markweave/vue3`: Vue 3 editor component, composable, Vue 3 extension factory, and `@markweave/vue3/styles.css`.
- `markweave/react`, `markweave/vue2`, and `markweave/vue3`: legacy compatibility shims that forward to the adapter packages for one release cycle.
- `markweave/styles.css`: core editor runtime stylesheet.
