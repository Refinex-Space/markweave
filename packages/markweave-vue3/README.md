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
