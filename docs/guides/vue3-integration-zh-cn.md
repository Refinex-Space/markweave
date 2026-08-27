---
owner: refinex
updated: 2026-08-27
status: active
referenced_by: docs/README.md#knowledge-map
---

# Vue 3 接入手册

语言：中文 | [English](./vue3-integration.md)

这是 Markweave 的 Vue 3 完整接入手册，覆盖安装、内容存储、Live/View 模式、上传、框架属性、回调、TOC 和生产边界。仓库里的私有参考实现是 `apps/playground-vue3`。

大文档应使用 `defaultContent`，避免每次按键都通过受控 `content` 往返；保留惰性 update payload，只在宿主保存/flush 边界读取 `payload.markdown`。可选 `resolveMediaSource` prop 与 React、Vue 2 共用带优先级和取消信号的请求；返回展示 URL 与可选固有尺寸后会启用共享轻量图片 NodeView，但不会改变序列化 Markdown。

## 安装

在已有 Vue 3 应用中安装 Vue 3 适配包：

```sh
pnpm add @markweave/vue3
```

`vue` 是宿主应用负责提供的 peer dependency：

```sh
pnpm add vue
```

在应用入口或编辑器组件中导入一次样式：

```ts
import "@markweave/vue3/styles.css";
```

## 最小编辑器

```vue
<script setup lang="ts">
import {
  MarkweaveEditor,
  type MarkweaveEditorUpdatePayload,
} from "@markweave/vue3";
import "@markweave/vue3/styles.css";

const initialMarkdown = `# Product Notes

Write in **Markdown**, edit visually, and store Markdown.`;

function handleUpdate(payload: MarkweaveEditorUpdatePayload) {
  saveDraft(payload.markdown);
}

function saveDraft(markdown: string) {
  console.log(markdown);
}
</script>

<template>
  <MarkweaveEditor
    aria-label="Product notes editor"
    :default-content="initialMarkdown"
    :on-update="handleUpdate"
  />
</template>
```

`default-content` 默认按 Markdown 解析。产品侧建议把 `payload.markdown` 作为主存储格式；Markweave 会优先输出标准 Markdown，仅在文字/高亮颜色、块对齐、段落或标题缩进、上标/下标、合并或样式化表格等标准 Markdown 无法表达的状态下输出原生 HTML fallback。fallback 使用包含 `editor-extensions` 的完整 Schema 序列化，满足 `renderHTML/parseHTML` 无损契约的宿主节点不会被静默丢弃。`payload.html`、`payload.json`、`payload.text` 仍适合用于预览、索引或集成。更新载荷按字段惰性序列化并缓存，因此只读取 `markdown` 不会额外生成 HTML、JSON 或纯文本；受控模式直接回传该字段时也会避免重复内容比较。

## 内容 API

| 模板属性 | TypeScript 属性 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `default-content` | `defaultContent` | `""` | 非受控初始内容。除非声明 `default-content-format`，否则按 Markdown 解析。 |
| `default-content-format` | `defaultContentFormat` | `"markdown"` | 旧 HTML 传 `"html"`；Tiptap JSON 传 `"json"`。 |
| `content` | `content` | `undefined` | 受控内容。除非声明 `content-format`，否则按 Markdown 解析。 |
| `content-format` | `contentFormat` | `"markdown"` | 受控内容格式。 |
| `on-update` | `onUpdate` | `undefined` | 保存 `payload.markdown`；按需读取 `html`、`json` 或 `text`。 |

受控 Markdown 示例：

```vue
<script setup lang="ts">
import { ref } from "vue";
import {
  MarkweaveEditor,
  type MarkweaveEditorUpdatePayload,
} from "@markweave/vue3";

const markdown = ref("# Hello Markweave");

function handleUpdate(payload: MarkweaveEditorUpdatePayload) {
  markdown.value = payload.markdown;
}
</script>

<template>
  <MarkweaveEditor
    :content="markdown"
    content-format="markdown"
    :on-update="handleUpdate"
  />
</template>
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
<script setup lang="ts">
import { MarkweaveEditor } from "@markweave/vue3";

function handleTocChange({ items, activeId }) {
  console.log(items, activeId);
}

function handleRuntimeStateChange(snapshot) {
  console.log(snapshot.mode, snapshot.editable, snapshot.toc);
}
</script>

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

附件元数据与宿主下载协议的规范字段见 [`attachment-upload-protocol-zh-cn.md`](./attachment-upload-protocol-zh-cn.md)。本页只保留 Vue 3 接线示例，避免与协议文档重复。

```vue
<script setup lang="ts">
import {
  MarkweaveEditor,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
} from "@markweave/vue3";

const handleUpload: MarkweaveSlashCommandUploadHandler = async (
  request: MarkweaveUploadRequest,
): Promise<MarkweaveUploadResult> => {
  if (request.source.type !== "file") {
    return {
      src: request.source.value ?? "",
      name: request.source.value?.split("/").filter(Boolean).at(-1),
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

  return response.json() as Promise<MarkweaveUploadResult>;
};
</script>

<template>
  <MarkweaveEditor :on-slash-command-upload="handleUpload" />
</template>
```

图片在 Live 模式下支持预览、对齐、Caption、缩放、替换、下载和删除；View 模式下 Hover 图片右上角会出现预览入口，可打开支持缩放与拖拽平移的大图预览。视频支持本地上传、直接视频 URL、YouTube embed URL、Bilibili player URL、普通 YouTube/Bilibili 分享链接，文件视频与平台嵌入默认不自动播放。附件经 `markweaveAttachment` 往返。Slash 附件插入空行内占位，点击选择本地文件上传（可选 `onProgress` 显示百分比）；完成后 hover 显示下载与删除，激活时调用 `onAttachmentDownload`；未提供宿主回调时，仅安全的 `http(s)` 源会新开标签页。

## Ask AI

Ask AI 默认关闭。Vue 模板通过 `:ask-ai` 显式开启：

```vue
<MarkweaveEditor :ask-ai="{ enabled: true, handler: handleAskAi }" />
```

`handleAskAi(request)` 返回 Markdown 或 `AsyncIterable<string>`。同一个 handler 通过 `request.target` 接收普通文本目标，以及表格单元格、行、列、选区或整表目标；旧 `selection` 字段继续作为扁平兼容投影。请求只包含目标局部内容。单单元格返回 Markdown 片段，多单元格目标返回精确等形的 GFM 表格。Markweave 先预览而不修改文档，只在接受时用一次可撤销事务替换目标单元格内容，并保留表格结构和属性。包含合并单元格的多单元格目标与 View 模式保持 fail-closed。

`on-rewrite-selection` 和 `on-extract-to-note` 继续作为兼容性旧回调保留。

## 宿主驱动 AI 预编辑协议

宿主已有 AI 命令、Agent 或对话面板时，可在不启用内置 `ask-ai` 的情况下使用 `MarkweaveAiEditController`。宿主读取受支持的选区、自行调用任意供应商并返回 Markdown；Markweave 只负责目标映射、原位审阅、接受、舍弃和冲突保护，不会发送供应商请求或接收密钥。

### 控制器生命周期与完整响应

编辑器创建后，`:on-ai-edit-controller-change` 传入控制器；销毁或重建前传入 `null`。每次控制器生命周期回调都必须替换宿主保存的引用，收到 `null` 后不得复用旧控制器。

```vue
<script setup lang="ts">
import { shallowRef } from "vue";
import {
  MarkweaveEditor,
  type MarkweaveAiEditController,
  type MarkweaveAiEditContext,
} from "@markweave/vue3";

const aiEdit = shallowRef<MarkweaveAiEditController | null>(null);

function setAiEditController(controller: MarkweaveAiEditController | null) {
  aiEdit.value = controller;
}

async function reviseSelection() {
  const controller = aiEdit.value;
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
    if (!signal.aborted) {
      controller.failProposal(id, error instanceof Error ? error.message : undefined);
    }
  }
}
</script>

<template>
  <MarkweaveEditor :on-ai-edit-controller-change="setAiEditController" />
</template>
```

`captureSelection()` 继续只捕获精确普通文本选区。`getSelection()` / `subscribeSelection()` 可按需取得选区正文和规范化 Markdown 的 1-based 块级 `lineRange`。需要所选段落或全文多处修改时，显式调用 `capture({ scope: "blocks" | "document" })`，并让 AI 返回该范围修改后的完整 Markdown。Markweave 在 `complete` 后计算并展示最多 200 个结构化 hunk，逐块决定先暂存，最后一次事务应用被接受的子集；不要用捕获位置自行修改文档。

### 累计流式响应与 headless 操作条

每次流式更新必须传入当前累计的完整 Markdown，而不是单个 token；结束时必须再提交一次 `complete`：

```ts
async function submitStream(
  controller: MarkweaveAiEditController,
  context: MarkweaveAiEditContext,
  stream: AsyncIterable<string>,
) {
  let markdown = "";
  try {
    for await (const chunk of stream) {
      if (context.signal.aborted) return;
      markdown += chunk;
      const updated = controller.updateProposal({
        contextId: context.id,
        markdown,
        status: "streaming",
      });
      if (!updated.ok) return;
    }
    controller.updateProposal({ contextId: context.id, markdown, status: "complete" });
  } catch (error) {
    if (!context.signal.aborted) {
      controller.failProposal(context.id, error instanceof Error ? error.message : undefined);
    }
  }
}
```

`captureSelection()` 默认显示底部居中的全局决策条，包含 hunk 计数、循环导航和全量操作；当前或 hover hunk 显示逐块操作。`controls: "none"` 隐藏两类内置控件。精确选区可在流式阶段预览，`blocks/document` 只在 `complete` 后展示多处 Diff。headless 宿主可使用 `previousHunk`、`nextHunk`、`acceptHunk`、`discardHunk`、`acceptAll`、`discardAll`；卸载时注销全部监听。

### 状态、错误码与安全规则

phase 包括 `idle`、`captured`、`streaming`、`review`、`error` 和 `conflict`。宿主可先通过 `getState()` 读取当前快照，再使用 `subscribe()` 监听后续变化。错误码包括 `active-review`、`stale-context`、`incomplete-proposal`、`unsupported-scope` 与 `proposal-too-complex`。每个编辑器只允许一个活动上下文；通过 `onDecision` 订阅接受、舍弃和冲突结果。目标内部编辑、切换 View 或卸载会中止上下文 `AbortSignal`。

精确 `selection` 仍拒绝代码块、表格/单元格和媒体/原子节点；`blocks/document` 可携带未改变的复杂结构，并对完整提案执行 schema 校验和有界多 hunk Diff。目标外编辑映射范围，目标内部编辑进入冲突；预览、错误、冲突和舍弃不改变文档，接受只产生一次事务和一次 Undo。

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

只有段落内容恰好为一个 HTTP(S) 链接时才可转为卡片；行内链接、混合文本链接与 `markweave:` 链接保持普通链接。使用 `link-card-resolver` 可在用户主动嵌入或修改卡片后补充元数据：

```vue
<MarkweaveEditor :link-card-resolver="resolveLinkCard" />
```

resolver 接收 `{ href, title, signal }`，不会在文档加载、滚动或普通链接点击时执行。外链抓取必须留在受控后端，并实施 URL/DNS 白名单、重定向、超时、响应体大小及图片 URL 校验；Markweave 核心不会自行请求外链。

## 能力覆盖

Vue 3 适配器提供完整 Markweave UI：浮动工具栏、链接弹层、slash 菜单、折叠块、表格句柄和选区 overlay、代码块语言/复制控制、Mermaid Code/Preview/放大/下载、图片/视频 NodeView、数学公式编辑、Live/View 模式、内置 TOC、中英文 UI。

## 生产接入建议

- 用 `on-update` payload 中的 `markdown` 存储正文；其中受支持的 HTML fallback 属于无损 Markdown 格式本身，而不是另一种文档模式。
- 保存逻辑在宿主侧做 debounce。
- `@markweave/vue3/styles.css` 只导入一次。
- 即使宿主系统的中文回退字体没有原生斜体字形，行内斜体也会保持可见。
- 上传接口必须做认证、文件大小、MIME 类型和返回 URL 校验。
- 不要接受任意 iframe host。Markweave 只处理直接视频和受支持的 YouTube/Bilibili embed 形态。
- Markweave 面向浏览器运行；Nuxt 等 SSR 框架中应在客户端渲染编辑器。
- View 模式安全链接会拒绝 `javascript:`、`data:`、`vbscript:` 等不安全协议。
## 通用命令与宿主 Extension

Vue 3 的 0.6.0 命令协议继续使用 callback props：绑定 `:command-groups`、`:commands`、`:builtin-commands`、`:editor-extensions`、`:on-command-controller-change` 和 `:on-command-error`，不新增另一套 emit。Registry props 更新不会重建 Editor；Extension schema 变化时必须 keyed remount。

完整 ID、结构化结果、取消/冲突、1 MiB 上限和 Tiptap 兼容边界见[通用命令与宿主 Extension 接入协议](./command-extension-protocol-zh-cn.md)。

## 受约束的原生表格

Markweave 0.7.0 新增 `:table-capabilities` callback prop。同步 resolver 只接收表格与祖先节点的只读描述，可以按当前原生表格关闭 Markweave 自有的结构、格式、复制或表格 AI 操作；resolver 异常时 fail-closed。完整规则见[宿主表格能力约束协议](./table-capability-protocol-zh-cn.md)。
