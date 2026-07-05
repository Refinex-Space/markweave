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
  return <MarkweaveEditor defaultContent="<h1>Hello Markweave</h1>" />;
}
```

## Exports

- `markweave`: React editor component, controller hook, and public types.
- `markweave/styles.css`: editor runtime stylesheet.
