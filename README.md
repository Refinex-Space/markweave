# markweave

Markdown-first WYSIWYG editor built on Tiptap and CodeMirror, providing Typora-like editing experience with block-level structure, slash commands, and rich text tooling.

`markweave` is the publishable editor package. The playground is a private workspace app for local demos and development checks, and is not included in the npm package.

## Install

Install the package plus the framework adapter peers you use.

### React

```sh
pnpm add markweave @tiptap/react react react-dom lucide-react
```

### Vue 3

```sh
pnpm add markweave @tiptap/vue-3 vue lucide-vue-next
```

### Vue 2

```sh
pnpm add markweave @tiptap/vue-2 vue@2.6.12 vue-template-compiler@2.6.12
```

All frameworks import the shared stylesheet:

```ts
import "markweave/styles.css";
```

## Usage

### React

```tsx
import { MarkweaveEditor } from "markweave/react";
import "markweave/styles.css";

export function Editor() {
  return (
    <MarkweaveEditor
      defaultContent={"# Hello Markweave\n\nStart writing in **Markdown**."}
      mode="live"
      onUpdate={({ markdown }) => {
        console.log(markdown);
      }}
    />
  );
}
```

### Vue 3

```vue
<script setup lang="ts">
import { MarkweaveEditor } from "markweave/vue3";
import "markweave/styles.css";

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

```js
import Vue from "vue";
import { MarkweaveEditor } from "markweave/vue2";
import "markweave/styles.css";

new Vue({
  components: { MarkweaveEditor },
  template: `
    <MarkweaveEditor
      default-content="# Hello Markweave\n\nStart writing in **Markdown**."
      mode="live"
      :on-update="handleUpdate"
    />
  `,
  methods: {
    handleUpdate({ markdown }) {
      console.log(markdown);
    },
  },
}).$mount("#app");
```

`defaultContent` and controlled `content` are parsed as Markdown unless you explicitly pass `defaultContentFormat` or `contentFormat`. Store `onUpdate.markdown` as the canonical product value; `html`, `json`, and `text` remain available for rendering and integration needs.

Legacy HTML input remains supported when declared explicitly:

```tsx
<MarkweaveEditor defaultContent="<h1>Hello Markweave</h1>" defaultContentFormat="html" />
```

`mode` defaults to `"live"`. Pass `mode="view"` for a read-only rendered view that reuses the same Markweave output styling. The existing `editable={false}` prop still works as a compatibility lock, so `mode="live" editable={false}` is also read-only.

`innerToc` defaults to `true` and renders the built-in right-side document outline from Markdown headings. Set `innerToc={false}` to hide the default UI while still receiving outline data through `onTocChange` and `onRuntimeStateChange`.

```tsx
<MarkweaveEditor
  defaultContent={"# Product Spec\n\n## Goals"}
  innerToc={false}
  onTocChange={({ items, activeId }) => {
    console.log(items, activeId);
  }}
/>
```

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

## Package Boundary

- `packages/markweave` contains the npm package named `markweave`.
- `markweave` exports framework-neutral types and helpers.
- `markweave/react` exports the React editor component, hook, and React extension factory.
- `markweave/vue2` exports the Vue 2 editor component, controller helper, and Vue 2 extension factory.
- `markweave/vue3` exports the Vue 3 editor component, composable, and Vue 3 extension factory.
- `markweave/styles.css` remains the shared stylesheet entry.
- `apps/playground-react`, `apps/playground-vue2`, and `apps/playground-vue3` contain private local demo apps.
- `apps/playground-fixtures` contains shared private playground Markdown fixtures.

## Local Development

```sh
pnpm install
pnpm dev
```

Open the default React playground:

```text
http://127.0.0.1:5173/
```

For Vue 3:

```sh
pnpm dev:vue3
```

Open:

```text
http://127.0.0.1:5174/
```

For Vue 2:

```sh
pnpm dev:vue2
```

Open:

```text
http://127.0.0.1:5175/
```

Useful checks:

```sh
pnpm test
pnpm typecheck
pnpm build
```
