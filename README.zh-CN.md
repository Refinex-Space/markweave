# markweave

语言：[English](./README.md) | 中文

Markweave 是一个 Markdown-first 的 WYSIWYG 编辑器，基于 Tiptap 和 ProseMirror，提供接近 Typora 的编辑体验、结构化块、slash 命令、表格、媒体、Mermaid、数学公式和富文本工具。

Markweave 发布一个框架无关核心包和三个框架适配包：React、Vue 2、Vue 3。`apps/playground-react`、`apps/playground-vue2`、`apps/playground-vue3` 是私有本地示例，不会发布到 npm。

## 完整接入手册

正式接入时请优先阅读对应框架的一篇完整手册。手册覆盖 Markdown 存储、上传、Live/View 模式、TOC、表格回调、AI 回调、媒体节点、Mermaid、数学公式和生产注意事项。

| 框架 | 中文 | English |
| --- | --- | --- |
| React | [React 接入手册](./docs/guides/react-integration-zh-cn.md) | [React Integration](./docs/guides/react-integration.md) |
| Vue 3 | [Vue 3 接入手册](./docs/guides/vue3-integration-zh-cn.md) | [Vue 3 Integration](./docs/guides/vue3-integration.md) |
| Vue 2 | [Vue 2 接入手册](./docs/guides/vue2-integration-zh-cn.md) | [Vue 2 Integration](./docs/guides/vue2-integration.md) |

## 安装

在已有框架应用中安装一个 Markweave 适配包。React 或 Vue 运行时仍由宿主应用提供。

### React

```sh
pnpm add @markweave/react
```

### Vue 3

```sh
pnpm add @markweave/vue3
```

### Vue 2

```sh
pnpm add @markweave/vue2
```

Vue 2 CLI / Webpack 4 项目需要保证 `vue-template-compiler` 与 `vue` 的 `2.6.x` 版本完全一致。已有 Vue 2 CLI 项目通常已经同时安装两者。

每个适配包都通过自己的 `styles.css` 子路径重新导出共享样式。直接使用核心包或旧兼容子路径时，也可以使用 `markweave/styles.css`。

## 快速使用

### React

```tsx
import { MarkweaveEditor } from "@markweave/react";
import "@markweave/react/styles.css";

export function Editor() {
  return (
    <MarkweaveEditor
      defaultContent={"# Hello Markweave\n\nStart writing in **Markdown**."}
      mode="live"
      onUpdate={({ markdown }) => {
        console.log(markdown);
      }}
    />
  );
}
```

### Vue 3

```vue
<script setup lang="ts">
import { MarkweaveEditor } from "@markweave/vue3";
import "@markweave/vue3/styles.css";

function handleUpdate({ markdown }: { markdown: string }) {
  console.log(markdown);
}
</script>

<template>
  <MarkweaveEditor
    default-content="# Hello Markweave\n\nStart writing in **Markdown**."
    mode="live"
    :on-update="handleUpdate"
  />
</template>
```

### Vue 2

Vue CLI 4 / Webpack 4 项目必须保证 `vue-template-compiler` 与 Vue 2.6.x 版本一致。

```vue
<template>
  <MarkweaveEditor
    :default-content="initialMarkdown"
    mode="live"
    :on-update="handleUpdate"
  />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";
import "@markweave/vue2/styles.css";

export default {
  name: "Editor",
  components: { MarkweaveEditor },
  data() {
    return {
      initialMarkdown: "# Hello Markweave\n\nStart writing in **Markdown**.",
    };
  },
  methods: {
    handleUpdate({ markdown }) {
      console.log(markdown);
    },
  },
};
</script>
```

## 核心概念

`defaultContent` 和受控 `content` 默认按 Markdown 解析。产品侧建议把 `onUpdate.markdown` 作为主存储格式；`html`、`json`、`text` 仍可用于渲染、搜索或集成。

旧 HTML 输入仍然支持，但必须显式声明格式：

```tsx
<MarkweaveEditor defaultContent="<h1>Hello Markweave</h1>" defaultContentFormat="html" />
```

`mode` 默认是 `"live"`。传 `mode="view"` 后进入只读渲染模式，并复用同一套 Markweave 输出样式。旧的 `editable={false}` 仍作为兼容锁，因此 `mode="live" editable={false}` 也是只读。`theme` 默认是 `"light"`；传 `theme="dark"` 可将编辑器根节点及全部内置交互界面切换为深石墨暗色主题。主题可在运行时切换，不会重建编辑器内容。

## 外部超链接卡片

Live 模式中，段落内容恰好为一个 HTTP(S) 链接时可以转换为链接卡片。混合文本链接、行内链接与 `markweave:` 文档链接仍保持普通链接。Markweave 不会自行请求外链；宿主如需解析标题、描述和预览图，应传入受控后端实现的 `linkCardResolver`。

```tsx
<MarkweaveEditor
  linkCardResolver={async ({ href, title, signal }) => {
    const response = await fetch(`/api/link-preview?url=${encodeURIComponent(href)}`, { signal });
    if (!response.ok) return null;
    return response.json(); // { title, description, siteName, imageUrl, faviconUrl }
  }}
/>
```

resolver 会收到已校验的 HTTP(S) URL、链接标题和 `AbortSignal`，并且只会在用户主动嵌入或修改卡片时执行。生产服务必须自行完成 URL 白名单、DNS/IP 校验、重定向次数、超时、响应体大小与图片 URL 过滤。链接卡片会在 Markdown 中保存安全 HTML fallback，以保留其元数据快照。

浮层操作保持紧凑：复制地址、嵌入、复制 Markdown 和移除链接均为纯图标控件，提供可访问标签以及 hover/focus Tooltip。

`innerToc` 默认是 `true`，会根据 Markdown 标题渲染内置右侧目录。`innerTocPlacement` 默认是 `"container"`：目录会相对视觉窗口垂直居中，正文以对称的目录留白保持居中；实际编辑器容器较窄时会自动隐藏内置目录，优先保证正文可读性。仅在确实需要固定到浏览器视口右侧时使用 `innerTocPlacement="viewport"`；传 `innerToc={false}` 或 `:inner-toc="false"` 可以隐藏内置 UI，同时继续通过 `onTocChange` 和 `onRuntimeStateChange` 获取目录数据。

## 框架能力矩阵

| 能力 | React | Vue 3 | Vue 2 |
| --- | --- | --- | --- |
| Markdown 输入/输出 | Yes | Yes | Yes |
| Live/View 模式 | Yes | Yes | Yes |
| 选中文本浮动工具栏 | Yes | Yes | Yes |
| Slash 命令菜单 | Yes | Yes | Yes |
| 表格与复制回调 | Yes | Yes | Yes |
| 图片/视频/附件渲染 | Yes | Yes | Yes |
| 代码块与 Mermaid | Yes | Yes | Yes |
| 数学公式编辑/渲染 | Yes | Yes | Yes |
| 内置目录 TOC | Yes | Yes | Yes |
| 上传与 AI 回调 | Yes | Yes | Yes |

## 包边界

- `packages/markweave` 发布为框架无关核心包 `markweave`。
- `packages/markweave-react` 发布为 `@markweave/react`。
- `packages/markweave-vue2` 发布为 `@markweave/vue2`。
- `packages/markweave-vue3` 发布为 `@markweave/vue3`。
- `markweave` 导出框架无关类型和工具。
- `@markweave/react` 导出 React 编辑器组件、hook、React extension factory 和 `@markweave/react/styles.css`。
- `@markweave/vue2` 导出 Vue 2 编辑器组件、controller helper、Vue 2 extension factory 和 `@markweave/vue2/styles.css`。
- `@markweave/vue3` 导出 Vue 3 编辑器组件、composable、Vue 3 extension factory 和 `@markweave/vue3/styles.css`。
- `markweave/react`、`markweave/vue2`、`markweave/vue3` 是兼容期 legacy shim，会转发到对应适配包。
- `markweave/styles.css` 是核心样式入口。

## 本地开发

```sh
pnpm install
pnpm dev
```

默认启动 React playground：

```text
http://127.0.0.1:5173/
```

Vue 3：

```sh
pnpm dev:vue3
```

```text
http://127.0.0.1:5174/
```

Vue 2：

```sh
pnpm dev:vue2
```

```text
http://127.0.0.1:5175/
```

常用检查：

```sh
pnpm test
pnpm typecheck
pnpm build
```
