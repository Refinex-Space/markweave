---
owner: refinex
updated: 2026-07-31
status: active
referenced_by: docs/README.md#knowledge-map
---

# Vue 2 接入手册

语言：中文 | [English](./vue2-integration.md)

这是 Markweave 的 Vue 2 完整接入手册，覆盖安装、Vue 2.6 编译器要求、Vue CLI 4 / Webpack 4 兼容配置、内容存储、Live/View 模式、上传、回调、TOC 和生产边界。仓库里的私有参考实现是 `apps/playground-vue2`。

大文档应使用 `defaultContent`，避免每次按键都通过受控 `content` 往返；保留惰性 update payload，只在宿主保存/flush 边界读取 `payload.markdown`。可选 `resolveMediaSource` prop 与 React、Vue 3 共用带优先级和取消信号的请求；返回展示 URL 与可选固有尺寸后会启用共享轻量图片 NodeView，但不会改变序列化 Markdown。

## 安装

在已有 Vue 2.6 应用中安装 Vue 2 适配包：

```sh
pnpm add @markweave/vue2
```

`vue` 是宿主应用负责提供的 peer dependency。Vue 2 项目必须保证 `vue-template-compiler` 与 `vue` 使用完全一致的 `2.6.x` 版本：

```sh
pnpm add vue@2.6.12 vue-template-compiler@2.6.12
```

在应用入口或编辑器组件中导入一次样式：

```js
import "@markweave/vue2/styles.css";
```

仅为了接入 Markweave，不需要额外安装 `@vue/composition-api`。Vue 2 适配包内部已经包含兼容层。

## Vue CLI 4 / Webpack 4 注意事项

旧 Vue 2 项目经常需要转译依赖，因为 Markweave 和 Tiptap 发布的是现代 ESM。如果项目使用 Vue CLI 4 / Webpack 4，可以从下面的 `vue.config.js` 结构开始：

```js
module.exports = {
  transpileDependencies: [
    "markweave",
    "@markweave/vue2",
    "@tiptap",
    "prosemirror",
    "lowlight",
    "mermaid",
    "marked",
    "es-toolkit",
    "@iconify",
    "@mermaid-js",
    "uuid",
  ],
  configureWebpack: {
    resolve: {
      extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".vue", ".json"],
    },
    module: {
      rules: [
        {
          test: /\.mjs$/,
          include: /node_modules/,
          type: "javascript/auto",
        },
      ],
    },
  },
};
```

`apps/playground-vue2` 里还有一些 workspace alias，这是因为 playground 直接消费本仓库源码。发布包用户应从 `@markweave/vue2` 导入，通常不需要复制那些本地源码 alias。

## 最小编辑器

```vue
<template>
  <MarkweaveEditor
    aria-label="Product notes editor"
    :default-content="initialMarkdown"
    :on-update="handleUpdate"
  />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";
import "@markweave/vue2/styles.css";

export default {
  name: "ProductEditor",
  components: { MarkweaveEditor },
  data() {
    return {
      initialMarkdown: "# Product Notes\n\nWrite in **Markdown**, edit visually, and store Markdown.",
    };
  },
  methods: {
    handleUpdate(payload) {
      this.saveDraft(payload.markdown);
    },
    saveDraft(markdown) {
      console.log(markdown);
    },
  },
};
</script>
```

`default-content` 默认按 Markdown 解析。产品侧建议把 `payload.markdown` 作为主存储格式；Markweave 会优先输出标准 Markdown，仅在文字/高亮颜色、块对齐、合并单元格等标准 Markdown 无法表达的状态下输出原生 HTML fallback。`payload.html`、`payload.json`、`payload.text` 仍适合用于预览、索引或集成。更新载荷按字段惰性序列化并缓存，因此只读取 `markdown` 不会额外生成 HTML、JSON 或纯文本；受控模式直接回传该字段时也会避免重复内容比较。

## 内容 API

| 模板属性 | JavaScript 属性 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `default-content` | `defaultContent` | `""` | 非受控初始内容。除非声明 `default-content-format`，否则按 Markdown 解析。 |
| `default-content-format` | `defaultContentFormat` | `"markdown"` | 旧 HTML 传 `"html"`；Tiptap JSON 传 `"json"`。 |
| `content` | `content` | `undefined` | 受控内容。除非声明 `content-format`，否则按 Markdown 解析。 |
| `content-format` | `contentFormat` | `"markdown"` | 受控内容格式。 |
| `on-update` | `onUpdate` | `undefined` | 保存 `payload.markdown`；按需读取 `html`、`json` 或 `text`。 |

受控 Markdown 示例：

```vue
<template>
  <MarkweaveEditor
    :content="markdown"
    content-format="markdown"
    :on-update="handleUpdate"
  />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";

export default {
  components: { MarkweaveEditor },
  data() {
    return {
      markdown: "# Hello Markweave",
    };
  },
  methods: {
    handleUpdate(payload) {
      this.markdown = payload.markdown;
    },
  },
};
</script>
```

旧 HTML 内容必须显式声明格式：

```vue
<template>
  <MarkweaveEditor
    default-content="<h1>Hello Markweave</h1>"
    default-content-format="html"
  />
</template>
```

高级自定义壳层可以使用 `useMarkweaveEditorController`，其中 `actions.setContent(content, { format, emitUpdate, focusFirstTableBodyCell })` 可用于命令式设置内容。普通产品接入推荐直接使用 `MarkweaveEditor`，因为它已经渲染完整的 toolbar、slash 菜单、表格控制、代码块控制、数学公式编辑、媒体 NodeView 和 TOC。

## 模式、语言与目录

```vue
<template>
  <MarkweaveEditor
    default-content="# Spec\n\n## Goals"
    mode="live"
    theme="dark"
    lang="zh"
    inner-toc
    :on-toc-change="handleTocChange"
    :on-runtime-state-change="handleRuntimeStateChange"
  />
</template>

<script>
export default {
  methods: {
    handleTocChange(state) {
      console.log(state.items, state.activeId);
    },
    handleRuntimeStateChange(snapshot) {
      console.log(snapshot.mode, snapshot.editable, snapshot.toc);
    },
  },
};
</script>
```

| 模板属性 | 默认值 | 说明 |
| --- | --- | --- |
| `mode` | `"live"` | `"live"` 可编辑；`"view"` 只读，但保留安全链接打开、代码复制、Mermaid 预览/放大/下载、媒体播放和 TOC 跳转等阅读能力。 |
| `theme` | `"light"` | `"light"` 或 `"dark"`。主题仅作用于当前编辑器根节点，可在运行时切换，不会重建文档内容。 |
| `canvasColor` | 主题默认值 | 仅覆盖编辑器画布的可选 CSS 颜色/变量。亮色默认透明，暗色默认 `#181A1F`；例如可传 `"#000"` 或 `"var(--app-canvas)"`，运行时切换不会重建编辑器。 |
| `editable` | `true` | 兼容锁。最终可编辑状态是 `mode === "live" && editable !== false`。 |
| `lang` | `"zh"` | UI 语言。支持 `"zh"` 和 `"en"`。运行时切换语言建议重新挂载编辑器。 |
| `inner-toc` | `true` | 显示内置右侧目录。传 `:inner-toc="false"` 后可通过 `on-toc-change` 或 `runtimeSnapshot.toc` 自行渲染目录。 |
| `inner-toc-placement` | `"container"` | 默认使目录始终相对视觉窗口垂直居中，并通过对称目录留白保持正文居中；实际编辑器容器较窄时会自动隐藏内置目录，优先保证正文可读性。仅在确实需要固定于视口右侧时传 `inner-toc-placement="viewport"`。 |
| `auto-focus-first-table-body-cell` | `false` | 适合 playground 或表格优先文档。 |

## 上传 API

图片和视频支持 URL、绝对路径、相对路径、Base64、本地文件。本地文件必须由宿主通过 `on-slash-command-upload` 上传；URL/path/Base64 可以直接作为结果使用。

Live 模式下，粘贴本地 `image/*` 剪贴板文件会按顺序插入全部图片，并通过同一个 `on-slash-command-upload` 处理器逐个上传，请求使用 `kind: "image"` 和 `trigger: "image-insert"`。仅包含图片的 HTML `<img>` 剪贴板内容在来源为 HTTP(S) 时直接插入；单独的 HTTP(S) URL 只有路径带常见图片扩展名时才转换为图片，Markweave 不会请求远端判断类型。同一次剪贴板同时存在文件和 HTML/URL 表示时优先处理文件，避免重复插入。

```vue
<template>
  <MarkweaveEditor :on-slash-command-upload="handleUpload" />
</template>

<script>
import { MarkweaveEditor } from "@markweave/vue2";

export default {
  components: { MarkweaveEditor },
  methods: {
    async handleUpload(request) {
      if (request.source.type !== "file") {
        return {
          src: request.source.value || "",
          name: request.source.value ? request.source.value.split("/").filter(Boolean).pop() : undefined,
          mimeType: request.source.mimeType,
        };
      }

      if (!request.source.file) {
        throw new Error("Missing upload file.");
      }

      const form = new FormData();
      form.append("file", request.source.file);
      form.append("kind", request.kind);
      form.append("trigger", request.trigger);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error("Upload failed.");
      }

      return response.json();
    },
  },
};
</script>
```

上传请求字段：

| 字段 | 取值 |
| --- | --- |
| `kind` | `"image"`、`"video"`、`"attachment"` |
| `trigger` | `"slash-command"`、`"image-insert"`、`"image-replace"`、`"video-insert"` |
| `source.type` | `"url"`、`"absolute-path"`、`"relative-path"`、`"base64"`、`"file"` |
| `source.value` | URL/path/Base64 输入时存在。 |
| `source.file` | 本地文件输入时存在。 |
| `source.mimeType` | 浏览器能识别时提供。 |

上传结果字段：

```ts
interface MarkweaveUploadResult {
  src: string;
  name?: string;
  alt?: string;
  title?: string;
  mimeType?: string;
  size?: number;
}
```

图片在 Live 模式下支持预览、对齐、Caption、缩放、替换、下载和删除；View 模式下 Hover 图片右上角会出现预览入口，可打开支持缩放与拖拽平移的大图预览。视频支持本地上传、直接视频 URL、YouTube embed URL、Bilibili player URL、普通 YouTube/Bilibili 分享链接。附件节点可以渲染已有 attachment HTML fallback；默认 slash Attachment 入口目前是禁用状态，但 `attachment` 仍保留在公开上传协议中，方便宿主后续扩展。

## Ask AI

Ask AI 默认关闭。Vue 模板通过 `:ask-ai` 显式开启：

```vue
<MarkweaveEditor :ask-ai="{ enabled: true, handler: handleAskAi }" />
```

`handleAskAi(request)` 返回 Markdown 或 `AsyncIterable<string>`。同一个 handler 通过 `request.target` 接收普通文本目标，以及表格单元格、行、列、选区或整表目标；旧 `selection` 字段继续作为扁平兼容投影。请求只包含目标局部内容。单单元格返回 Markdown 片段，多单元格目标返回精确等形的 GFM 表格。Markweave 先预览而不修改文档，只在接受时用一次可撤销事务替换目标单元格内容，并保留表格结构和属性。包含合并单元格的多单元格目标与 View 模式保持 fail-closed。

`on-rewrite-selection` 和 `on-extract-to-note` 继续作为兼容性旧回调保留。

## 宿主驱动 AI 预编辑协议

Vue 2 宿主通过 `:on-ai-edit-controller-change` 获取与 React/Vue 3 相同的 `MarkweaveAiEditController`。该能力独立于内置 `ask-ai`：宿主自行调用任意供应商并返回 Markdown，Markweave 负责目标映射、原位审阅、接受、舍弃和冲突保护。

### 控制器生命周期与完整响应

编辑器创建后回调传入控制器，销毁或重建前传入 `null`。每次控制器生命周期回调都应替换宿主引用，收到 `null` 后不得复用旧控制器。

```vue
<MarkweaveEditor :on-ai-edit-controller-change="setAiEditController" />
```

```js
export default {
  data() {
    return { aiEditController: null };
  },
  methods: {
    setAiEditController(controller) {
      this.aiEditController = controller;
    },
    async reviseSelection() {
      const controller = this.aiEditController;
      if (!controller) return;
      const captured = controller.captureSelection({ metadata: { action: "revise" } });
      if (!captured.ok) {
        console.warn(captured.code, captured.message);
        return;
      }
      const { id, selection, signal } = captured.value;
      try {
        const markdown = await callHostAi(selection, signal);
        const completed = controller.updateProposal({ contextId: id, markdown, status: "complete" });
        if (!completed.ok) console.warn(completed.code, completed.message);
      } catch (error) {
        if (!signal.aborted) controller.failProposal(id, error instanceof Error ? error.message : undefined);
      }
    },
  },
};
```

上下文只含 `selection.from`、`to`、`text`、`html` 和 `markdown`，不会包含整篇文档。不要用捕获时的位置自行修改文档；应调用 `accept(contextId)`，由 Markweave 在当前映射目标上执行一次可撤销事务。

### 累计流式响应与 headless 操作条

每次流式调用必须传入当前累计的完整 Markdown，而非单个 token，并以 `status: "complete"` 结束。暂时无法解析的流式片段保留上一次有效预览；宿主失败时调用 `failProposal`。`captureSelection({ controls: "none" })` 只隐藏默认操作条。由于 `subscribe()` 只报告后续变化，自定义界面应先读取 `getState()`，并在 `beforeDestroy` 中注销 `subscribe` 和 `onDecision` 监听。只有 `review` phase 可 `accept`；任意活动 phase 均可 `discard`。

### 状态、错误码与安全规则

phase 包括 `idle`、`captured`、`streaming`、`review`、`error` 和 `conflict`。错误码包括 `readonly`、`no-selection`、`unsupported-selection`、`active-review`、`stale-context`、`invalid-markdown`、`schema-incompatible`、`incomplete-proposal` 和 `conflict`；每个编辑器只允许一个活动上下文。

V1 只捕获可编辑 Live 模式下的普通非空文本选区；代码块、表格/单元格、媒体/原子节点、`NodeSelection` 和 `CellSelection` 暂不支持，但提案可包含 schema 支持的列表、代码和数学公式。目标外编辑会映射范围；目标内部编辑、切换 View、舍弃或编辑器销毁会中止上下文 `AbortSignal`。signal 中止或返回 `stale-context` 后必须忽略迟到任务。预览、失败、冲突和舍弃不改变序列化内容或撤销历史。`onDecision` 报告 `accepted`、`discarded` 或 `conflict` 并回传 metadata。

## 表格、兼容 AI 回调与复制回调

```vue
<template>
  <MarkweaveEditor
    :on-edit-with-ai="handleEditWithAi"
    :on-rewrite-selection="handleRewriteSelection"
    :on-extract-to-note="handleExtractToNote"
    :on-table-copy-payload="handleTableCopyPayload"
    :on-table-command-result="handleTableCommandResult"
  />
</template>
```

- `on-edit-with-ai` 作为废弃兼容属性继续保留，但内置菜单不再渲染该旧入口；新接入使用 `ask-ai`。
- `on-rewrite-selection` 和 `on-extract-to-note` 是兼容性旧回调。
- `on-table-copy-payload` 接收复制行、列或整表时的文本与 HTML。
- `on-table-command-result` 接收表格命令执行结果和 before/after 快照。

内置表格控制采用 Notion-like 的行、列与选区句柄。启用 `ask-ai` 后，`Ask AI` 会成为所有表格句柄菜单的首项。行列菜单同时覆盖移动、插入、排序、颜色、对齐、清空、复制与删除；选区菜单继续保留合并、拆分、复制与删除。Hover 最后一行或最后一列会显示整边快捷新增控件，拖拽行列句柄可直接调整顺序；全部菜单名称跟随 `lang`（`zh` 或 `en`）。

## 外部超链接卡片

只有段落内容恰好为一个 HTTP(S) 链接时才可转为卡片；行内链接、混合文本链接与 `markweave:` 链接保持普通链接。传入 `:link-card-resolver="resolveLinkCard"` 后，只有用户主动嵌入或修改卡片才会请求元数据。

resolver 接收 `{ href, title, signal }`，不会在加载、滚动或普通链接点击时运行。元数据抓取必须由宿主后端执行 URL/DNS 白名单、重定向与超时、响应体大小和图片 URL 校验；Markweave 不会自行请求外链。

## 能力覆盖

Vue 2 适配器提供完整 Markweave UI：浮动工具栏、链接弹层、slash 菜单、表格句柄和选区 overlay、代码块语言/复制控制、Mermaid Code/Preview/放大/下载、图片/视频 NodeView、数学公式编辑、Live/View 模式、内置 TOC、中英文 UI。

## 生产接入建议

- 用 `on-update` payload 中的 `markdown` 存储正文；其中受支持的 HTML fallback 属于无损 Markdown 格式本身，而不是另一种文档模式。
- 保存逻辑在宿主侧做 debounce。
- `@markweave/vue2/styles.css` 只导入一次。
- 即使宿主系统的中文回退字体没有原生斜体字形，行内斜体也会保持可见。
- 保持 `vue` 和 `vue-template-compiler` 版本完全一致。
- 使用 Vue CLI 4 / Webpack 4 时，为现代 ESM 依赖保留 `transpileDependencies`。
- Markweave 0.3.5 不再让 CSS 查询容器影响固定目录定位，并会在挂载后主动探测 pending 状态的首屏图片，覆盖 Electron 21 / Chromium 106 延迟首次 `IntersectionObserver` 回调的情况。
- 上传接口必须做认证、文件大小、MIME 类型和返回 URL 校验。
- 不要接受任意 iframe host。Markweave 只处理直接视频和受支持的 YouTube/Bilibili embed 形态。
- Markweave 面向浏览器运行；SSR 场景中应在客户端渲染编辑器。
- View 模式安全链接会拒绝 `javascript:`、`data:`、`vbscript:` 等不安全协议。
