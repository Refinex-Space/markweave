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

## Host-Driven AI Edit Review

Version 0.5.0 exposes lazy selection snapshots plus explicit selection, block, and document AI edit scopes through `MarkweaveAiEditController`. Multi-scope proposals provide count/navigation, global decisions, and staged per-hunk decisions before one atomic settlement, without Markweave sending provider requests or receiving credentials.

```tsx
import { useState } from "react";
import { MarkweaveEditor, type MarkweaveAiEditController } from "@markweave/react";

const [aiEdit, setAiEdit] = useState<MarkweaveAiEditController | null>(null);

<MarkweaveEditor onAiEditControllerChange={setAiEdit} />;
```

The callback receives a controller after editor creation and `null` before teardown or recreation. See the full integration guide for `captureSelection`, cumulative streaming, default/headless controls, conflicts, acceptance, and error handling.

## Command Registry And Host Extensions

Version 0.6.0 adds `commandGroups`, `commands`, `builtinCommands`, `editorExtensions`, `onCommandControllerChange`, and `onCommandError`. The stable command controller executes the same async command path as Slash; host extensions are additive-only creation-time schema code and require a keyed remount when changed. See the full command/extension protocol for result placement, cancellation, conflicts, the 1 MiB result cap, and Tiptap 3.27.x compatibility.

Version 0.7.0 adds `tableCapabilities`, a synchronous per-table resolver for Markweave-owned structure, formatting, copy, and table-AI operations. It receives readonly table and ancestor descriptors and fails closed on resolver errors.
