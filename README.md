# markweave

Markdown-first WYSIWYG editor built on Tiptap and CodeMirror, providing Typora-like editing experience with block-level structure, slash commands, and rich text tooling.

`markweave` is the publishable editor package. The playground is a private workspace app for local demos and development checks, and is not included in the npm package.

## Install

```sh
npm i markweave
```

or:

```sh
pnpm add markweave
```

## Usage

```tsx
import { MarkweaveEditor } from "markweave";
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

## Package Boundary

- `packages/markweave` contains the npm package named `markweave`.
- `apps/playground` contains the local demo app and is marked private.
- The package export exposes the React editor entry and `markweave/styles.css`.

## Local Development

```sh
pnpm install
pnpm dev
```

Open:

```text
http://127.0.0.1:5173/
```

Useful checks:

```sh
pnpm test
pnpm typecheck
pnpm build
```
