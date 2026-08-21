# @markweave/vue2

Vue 2 adapter for Markweave.

Full guide: [Vue 2 Integration](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue2-integration.md) | [Vue 2 接入手册](https://github.com/Refinex-Space/markweave/blob/main/docs/guides/vue2-integration-zh-cn.md)

Version 0.7.0 adds the `table-capabilities` callback prop, a synchronous per-table resolver for Markweave-owned structure, formatting, copy, and table-AI operations. It receives readonly table and ancestor descriptors and fails closed on resolver errors.

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

## Vue CLI 4 / Webpack 4 Legacy Entry

The dedicated ES2019 entry prebundles heavy editor features while preserving Vue, the Tiptap Vue 2 adapter, Tiptap core/PM, and ProseMirror as host-owned singleton runtimes. Keep normal component imports and apply the published helper in `vue.config.js`:

```js
const applyMarkweaveVue2Webpack4Legacy = require("@markweave/vue2/webpack4");

module.exports = {
  chainWebpack(config) {
    applyMarkweaveVue2Webpack4Legacy(config, { projectRoot: __dirname });
  },
};
```

Hosts that own their aliases can import `@markweave/vue2/legacy` explicitly and pass `aliasPackageImport: false`. Do not add Markweave, Mermaid, Cytoscape, D3, or Lowlight to a broad Babel rule when using this entry. The helper keeps its cache outside `node_modules` so repeated `npm ci` builds can reuse it.

The built-in outline uses `inner-toc-placement="container"` by default, keeping it vertically centered in the visual viewport while symmetric TOC gutters keep the writing column centered. It hides automatically in a narrow editor container to preserve readable content width.

Version 0.3.5 keeps this fixed positioning and resolver-backed first-screen image loading compatible with Vue CLI 4 applications hosted in Electron 21 / Chromium 106.

## Host-Driven AI Edit Review

Version 0.5.0 exposes lazy selection snapshots plus explicit selection, block, and document AI edit scopes through `MarkweaveAiEditController`. Keyed Vue 2 replacements preserve the successor controller, while multi-scope proposals provide count/navigation, global decisions, and staged per-hunk decisions before one atomic settlement.

```vue
<MarkweaveEditor :on-ai-edit-controller-change="setAiEditController" />
```

The callback receives a controller after editor creation and `null` before teardown or recreation. See the full integration guide for `captureSelection`, cumulative streaming, default/headless controls, conflicts, acceptance, and error handling.

## Command Registry And Host Extensions

Version 0.6.0 adds `:command-groups`, `:commands`, `:builtin-commands`, `:editor-extensions`, `:on-command-controller-change`, and `:on-command-error`. Vue 2 keeps callback props rather than a second emit contract. Registry updates preserve the Editor; Extension schema updates require a keyed replacement. The Vue CLI 4 / Webpack 4 playground verifies this path.
