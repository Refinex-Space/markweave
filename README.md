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
      defaultContent="<h1>Hello Markweave</h1>"
      onUpdate={({ html }) => {
        console.log(html);
      }}
    />
  );
}
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
