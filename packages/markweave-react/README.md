# @markweave/react

React adapter for Markweave.

Full guide: [React Integration](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/react-integration.md) | [React 接入手册](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/react-integration-zh-cn.md)

```sh
pnpm add @markweave/react
```

```tsx
import { MarkweaveEditor } from "@markweave/react";
import "@markweave/react/styles.css";

export function Editor() {
  return <MarkweaveEditor defaultContent="# Hello Markweave" />;
}
```

React and React DOM remain peer dependencies and should come from the host app.

The built-in outline uses `innerTocPlacement="container"` by default, keeping it vertically centered in the visual viewport while symmetric TOC gutters keep the writing column centered. It hides automatically in a narrow editor container to preserve readable content width.

Version 0.3.5 keeps this fixed positioning and resolver-backed first-screen image loading compatible with Electron 21 / Chromium 106 hosts.
