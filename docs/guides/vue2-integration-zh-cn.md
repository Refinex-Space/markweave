---
owner: refinex
updated: 2026-08-13
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

`default-content` 默认按 Markdown 解析。产品侧建议把 `payload.markdown` 作为主存储格式；Markweave 会优先输出标准 Markdown，仅在文字/高亮颜色、块对齐、段落或标题缩进、上标/下标、合并或样式化表格等标准 Markdown 无法表达的状态下输出原生 HTML fallback。fallback 使用包含 `editor-extensions` 的完整 Schema 序列化，满足 `renderHTML/parseHTML` 无损契约的宿主节点不会被静默丢弃。`payload.html`、`payload.json`、`payload.text` 仍适合用于预览、索引或集成。更新载荷按字段惰性序列化并缓存，因此只读取 `markdown` 不会额外生成 HTML、JSON 或纯文本；受控模式直接回传该字段时也会避免重复内容比较。

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
| `reveal-link-markdown` | `true` | 在可编辑 Live 模式中，点击行内链接或将光标移入链接会显示规范化的 `[文字](地址 "标题")`。Enter 或失焦提交安全地址，Escape 放弃，Ctrl/Cmd 点击打开链接。该内容是规范化投影，不保证逐字节还原原始 Markdown。 |
| `lang` | `"zh"` | UI 语言。支持 `"zh"` 和 `"en"`。运行时切换语言建议重新挂载编辑器。 |
| `inner-toc` | `true` | 显示内置右侧目录。传 `:inner-toc="false"` 后可通过 `on-toc-change` 或 `runtimeSnapshot.toc` 自行渲染目录。 |
| `inner-toc-placement` | `"container"` | 默认使目录始终相对视觉窗口垂直居中，并通过对称目录留白保持正文居中；实际编辑器容器较窄时会自动隐藏内置目录，优先保证正文可读性。仅在确实需要固定于视口右侧时传 `inner-toc-placement="viewport"`。 |
| `auto-focus-first-table-body-cell` | `false` | 适合 playground 或表格优先文档。 |

## 上传 API

图片和视频支持 URL、绝对路径、相对路径、Base64、本地文件。本地文件必须由宿主通过 `on-slash-command-upload` 上传；URL/path/Base64 可以直接作为结果使用。

Live 模式下，粘贴本地 `image/*` 剪贴板文件会按顺序插入全部图片，并通过同一个 `on-slash-command-upload` 处理器逐个上传，请求使用 `kind: "image"` 和 `trigger: "image-insert"`。仅包含图片的 HTML `<img>` 剪贴板内容在来源为 HTTP(S) 时直接插入；单独的 HTTP(S) URL 只有路径带常见图片扩展名时才转换为图片，Markweave 不会请求远端判断类型。同一次剪贴板同时存在文件和 HTML/URL 表示时优先处理文件，避免重复插入。

附件元数据与宿主下载协议的规范字段见 [`attachment-upload-protocol-zh-cn.md`](./attachment-upload-protocol-zh-cn.md)。本页只保留 Vue 2 接线示例，避免与协议文档重复。

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

图片在 Live 模式下支持预览、对齐、Caption、缩放、替换、下载和删除；View 模式下 Hover 图片右上角会出现预览入口，可打开支持缩放与拖拽平移的大图预览。视频支持本地上传、直接视频 URL、YouTube embed URL、Bilibili player URL、普通 YouTube/Bilibili 分享链接，文件视频与平台嵌入默认不自动播放。附件经 `markweaveAttachment` 往返。Slash 附件插入空行内占位，点击选择本地文件上传（可选 `onProgress` 显示百分比）；完成后 hover 显示下载与删除，激活时调用 `onAttachmentDownload`；未提供宿主回调时，仅安全的 `http(s)` 源会新开标签页。

## Ask AI

Ask AI 默认关闭。Vue 模板通过 `:ask-ai` 显式开启：

Ask AI 输入框绑定打开时的原始选区。用户在编辑区按下鼠标、触控笔或触屏并开始选择其他内容时，Markweave 会先关闭并取消当前 Ask AI 会话，再为新选区恢复常规浮动工具条；点击输入框或面板内部不会触发关闭。

```vue
<MarkweaveEditor :ask-ai="{ enabled: true, handler: handleAskAi }" />
```

`handleAskAi(request)` 返回 Markdown 或 `AsyncIterable<string>`。同一个 handler 通过 `request.target` 接收普通文本目标，以及表格单元格、行、列、选区或整表目标；旧 `selection` 字段继续作为扁平兼容投影。请求只包含目标局部内容。单单元格返回 Markdown 片段，多单元格目标返回精确等形的 GFM 表格。Markweave 先预览而不修改文档，只在接受时用一次可撤销事务替换目标单元格内容，并保留表格结构和属性。包含合并单元格的多单元格目标与 View 模式保持 fail-closed。

`on-rewrite-selection` 和 `on-extract-to-note` 继续作为兼容性旧回调保留。

## 宿主驱动 AI 预编辑协议

Vue 2 宿主通过 `:on-ai-edit-controller-change` 获取与 React/Vue 3 相同的 `MarkweaveAiEditController`。该能力独立于内置 `ask-ai`：宿主自行调用任意供应商并返回 Markdown，Markweave 负责目标映射、原位审阅、接受、舍弃和冲突保护。

### 控制器生命周期与完整响应

编辑器创建后回调传入控制器，最终销毁时传入 `null`。Vue 2 的 keyed 重建会在下一次 tick 发布后继控制器，旧实例清理不会再用迟到的 `null` 覆盖新引用。每次回调仍应替换宿主引用，收到 `null` 后不得复用旧控制器。

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

`captureSelection()` 继续只捕获精确普通文本选区。`getSelection()` 与 `subscribeSelection()` 可让宿主按需取得选区的 `text`、`html`、`markdown` 及 `lineRange`；行号是规范化 Markdown 的 1-based 块级位置，不是上传原文件的字节级源码位置。选区正文不会进入高频 runtime snapshot。

### 所选段落与全文多处修改

```js
const snapshot = controller.getSelection();
const unsubscribe = controller.subscribeSelection((selection) => {
  renderSelectionHint(selection); // 例如：第 5-7 行
});

// “修改所选段落”动作；没有选区时修改光标所在顶层块。
const capturedBlocks = controller.capture({
  scope: "blocks",
  controls: "default",
  metadata: { action: "revise" },
});

// 独立且明确的“检查并修改全文”动作，不要由空选区自动触发。
const capturedDocument = controller.capture({
  scope: "document",
  controls: "default",
  metadata: { action: "revise-document" },
});
```

`scope: "selection"` 要求普通非空文本选区并保持单点替换；`blocks` 将当前选区或光标扩展到覆盖的顶层块；`document` 不要求选区并显式捕获全文。后两种模式要求 AI 返回捕获范围修改后的完整 Markdown，而不是补丁、ProseMirror 位置或单个片段。Markweave 在 `complete` 后计算最多 200 个结构化 hunk，原位展示多处 Diff；逐块决定先暂存，全部处理完成后，被接受的子集通过一次事务应用，`onDecision.appliedRanges` 返回实际范围；舍弃、失败和冲突不修改文档。

不要用捕获时的位置自行修改文档。全文捕获必须是宿主明确展示并授权的产品动作，Markweave 不会因为没有选区自动扩大范围。

### 累计流式响应与 headless 操作条

每次流式调用必须传入当前累计的完整 Markdown，而非单个 token，并以 `status: "complete"` 结束。精确选区可在流式期间更新局部预览；`blocks/document` 只在 complete 后展示多处 Diff。宿主失败时调用 `failProposal`。默认操作使用一个挂载到 `body`、固定在编辑器当前可视边界底部居中的决策条，提供 hunk 计数、循环导航和全量操作；当前或 hover hunk 显示逐块操作。`controls: "none"` 隐藏两类内置控件。自定义界面应先读取 `getState()`，并使用 `previousHunk`、`nextHunk`、`acceptHunk`、`discardHunk`、`acceptAll`、`discardAll`；两类监听都应在 `beforeDestroy` 中注销。

### 状态、错误码与安全规则

phase 包括 `idle`、`captured`、`streaming`、`review`、`error` 和 `conflict`。错误码包括 `active-review`、`stale-context`、`incomplete-proposal`、`unsupported-scope` 和 `proposal-too-complex`；每个编辑器只允许一个活动上下文。

精确 `selection` 仍拒绝代码块、表格/单元格、媒体/原子节点、`NodeSelection` 和 `CellSelection`；`blocks/document` 可以安全携带这些未改变的结构，并由 schema 校验完整提案。目标外编辑会映射范围；目标内部编辑、切换 View、舍弃或编辑器销毁会中止上下文 `AbortSignal`。signal 中止或返回 `stale-context` 后必须忽略迟到任务。预览、失败、冲突和舍弃不改变序列化内容或撤销历史。

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
- 宿主驱动 AI 多处审阅的全局决策条直接挂载到 `body`，不依赖 CSS query container；逐块操作和 Tooltip 只使用 Electron 21 / Chromium 106 已支持的 DOM、选择器与布局能力。
- Markweave 0.3.5 不再让 CSS 查询容器影响固定目录定位，并会在挂载后主动探测 pending 状态的首屏图片，覆盖 Electron 21 / Chromium 106 延迟首次 `IntersectionObserver` 回调的情况。
- 上传接口必须做认证、文件大小、MIME 类型和返回 URL 校验。
- 不要接受任意 iframe host。Markweave 只处理直接视频和受支持的 YouTube/Bilibili embed 形态。
- Markweave 面向浏览器运行；SSR 场景中应在客户端渲染编辑器。
- View 模式安全链接会拒绝 `javascript:`、`data:`、`vbscript:` 等不安全协议。
## 通用命令与宿主 Extension

Vue 2 的 0.6.0 命令协议继续使用 callback props：绑定 `:command-groups`、`:commands`、`:builtin-commands`、`:editor-extensions`、`:on-command-controller-change` 和 `:on-command-error`，不新增另一套 emit。Registry props 原地更新；Extension schema 变化时使用不同 `key` 重建组件。

```vue
<MarkweaveEditor
  :key="schemaVersion"
  :command-groups="commandGroups"
  :commands="commands"
  :editor-extensions="editorExtensions"
  :on-command-controller-change="setCommandController"
/>
```

异步 Runtime、结果/位置、取消/冲突和安全边界见[通用命令与宿主 Extension 接入协议](./command-extension-protocol-zh-cn.md)。

## 受约束的原生表格

Markweave 0.7.0 新增 `:table-capabilities` callback prop。同步 resolver 只接收表格与祖先节点的只读描述，可以按当前原生表格关闭 Markweave 自有的结构、格式、复制或表格 AI 操作；resolver 异常时 fail-closed。完整规则见[宿主表格能力约束协议](./table-capability-protocol-zh-cn.md)。
