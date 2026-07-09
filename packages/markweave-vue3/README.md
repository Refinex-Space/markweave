# @markweave/vue3

Vue 3 adapter for Markweave.

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
