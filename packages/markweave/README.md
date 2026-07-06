# markweave

Markdown-first WYSIWYG editor built on Tiptap and CodeMirror, providing Typora-like editing experience with block-level structure, slash commands, and rich text tooling.

## Install

```sh
pnpm add markweave
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
      onUpdate={({ markdown }) => console.log(markdown)}
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

`defaultContent` and controlled `content` are Markdown by default. Use `defaultContentFormat="html"` or `contentFormat="html"` when migrating an existing HTML integration. `onUpdate.markdown` is the recommended storage output; `html`, `json`, and `text` remain available.

`mode` defaults to `"live"`. Use `mode="view"` for a read-only rendered view. `editable={false}` remains a compatibility lock, including when `mode="live"`.

`innerToc` defaults to `true` and shows a built-in right-side outline derived from document headings. Set `innerToc={false}` when rendering your own outline from `onTocChange` or `runtimeSnapshot.toc`.

## Exports

- `markweave`: framework-neutral types and helpers, including content format, mode, lang, TOC, upload, and table payload types.
- `markweave/react`: React editor component, controller hook, and React extension factory.
- `markweave/vue3`: Vue 3 editor component, composable, and Vue 3 extension factory.
- `markweave/styles.css`: editor runtime stylesheet.
