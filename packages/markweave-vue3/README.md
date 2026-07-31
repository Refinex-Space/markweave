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

Version 0.3.6 exports `MarkweaveAiEditController` and exposes it through `:on-ai-edit-controller-change`. The host captures a supported text selection, calls its own AI service, and submits Markdown for in-place review; Markweave does not send provider requests or receive credentials.

```vue
<MarkweaveEditor :on-ai-edit-controller-change="setAiEditController" />
```

The callback receives a controller after editor creation and `null` before teardown or recreation. See the full integration guide for `captureSelection`, cumulative streaming, default/headless controls, conflicts, acceptance, and error handling.
