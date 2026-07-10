# @markweave/vue2

Vue 2 adapter for Markweave.

Full guide: [Vue 2 Integration](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue2-integration.md) | [Vue 2 接入手册](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue2-integration-zh-cn.md)

```sh
pnpm add @markweave/vue2
```

```vue
<template>
  <MarkweaveEditor default-content="# Hello Markweave" />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";
import "@markweave/vue2/styles.css";

export default {
  components: { MarkweaveEditor },
};
</script>
```

Vue remains a peer dependency and should come from the host app. Vue CLI 4 / Webpack 4 projects should keep `vue-template-compiler` on the same Vue 2.6.x version as `vue`.

The built-in outline uses `inner-toc-placement="container"` by default, keeping it vertically centered in the visual viewport while aligning its expanded panel to the editor without covering document content.
