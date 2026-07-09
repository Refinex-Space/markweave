# @markweave/vue2

Vue 2 adapter for Markweave.

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
