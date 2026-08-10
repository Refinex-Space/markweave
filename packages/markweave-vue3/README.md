# @markweave/vue3

Vue 3 adapter for Markweave.

Full guide: [Vue 3 Integration](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue3-integration.md) | [Vue 3 接入手册](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue3-integration-zh-cn.md)

```sh
pnpm add @markweave/vue3
```

```vue
<template>
  <MarkweaveEditor default-content="# Hello Markweave" />
</template>

<script setup lang="ts">
import { MarkweaveEditor } from "@markweave/vue3";
import "@markweave/vue3/styles.css";
</script>
```

Vue remains a peer dependency and should come from the host app.

The built-in outline uses `inner-toc-placement="container"` by default, keeping it vertically centered in the visual viewport while symmetric TOC gutters keep the writing column centered. It hides automatically in a narrow editor container to preserve readable content width.

Version 0.3.5 keeps this fixed positioning and resolver-backed first-screen image loading compatible with Electron 21 / Chromium 106 hosts.

## Host-Driven AI Edit Review

Version 0.5.0 exposes lazy selection snapshots plus explicit selection, block, and document AI edit scopes through `MarkweaveAiEditController`. Multi-scope proposals provide count/navigation, global decisions, and staged per-hunk decisions before one atomic settlement, without Markweave sending provider requests or receiving credentials.

```vue
<MarkweaveEditor :on-ai-edit-controller-change="setAiEditController" />
```

The callback receives a controller after editor creation and `null` before teardown or recreation. See the full integration guide for `captureSelection`, cumulative streaming, default/headless controls, conflicts, acceptance, and error handling.

## Command Registry And Host Extensions

Version 0.6.0 adds `:command-groups`, `:commands`, `:builtin-commands`, `:editor-extensions`, `:on-command-controller-change`, and `:on-command-error`. Vue 3 keeps callback props rather than a second emit contract. Registry updates preserve the Editor; Extension schema updates require a keyed remount.
