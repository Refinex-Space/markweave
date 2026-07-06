# markweave

Markdown-first WYSIWYG editor built on Tiptap and CodeMirror, providing Typora-like editing experience with block-level structure, slash commands, and rich text tooling.

## Install

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
      onUpdate={({ markdown }) => console.log(markdown)}
    />
  );
}
```

`defaultContent` and controlled `content` are Markdown by default. Use `defaultContentFormat="html"` or `contentFormat="html"` when migrating an existing HTML integration. `onUpdate.markdown` is the recommended storage output; `html`, `json`, and `text` remain available.

`mode` defaults to `"live"`. Use `mode="view"` for a read-only rendered view. `editable={false}` remains a compatibility lock, including when `mode="live"`.

## Exports

- `markweave`: React editor component, controller hook, and public types.
- `markweave/styles.css`: editor runtime stylesheet.
