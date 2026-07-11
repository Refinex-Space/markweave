---
owner: refinex
updated: 2026-07-11
status: active
referenced_by: docs/README.md#knowledge-map
---

# Vue 3 接入手册

语言：中文 | [English](./vue3-integration.md)

这是 Markweave 的 Vue 3 完整接入手册，覆盖安装、内容存储、Live/View 模式、上传、框架属性、回调、TOC 和生产边界。仓库里的私有参考实现是 `apps/playground-vue3`。

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

`default-content` 默认按 Markdown 解析。产品侧建议把 `payload.markdown` 作为主存储格式；Markweave 会优先输出标准 Markdown，仅在文字/高亮颜色、块对齐、合并单元格等标准 Markdown 无法表达的状态下输出原生 HTML fallback。`payload.html`、`payload.json`、`payload.text` 仍适合用于预览、索引或集成。更新载荷按字段惰性序列化并缓存，因此只读取 `markdown` 不会额外生成 HTML、JSON 或纯文本；受控模式直接回传该字段时也会避免重复内容比较。

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
| `editable` | `true` | 兼容锁。最终可编辑状态是 `mode === "live" && editable !== false`。 |
| `lang` | `"zh"` | UI 语言。支持 `"zh"` 和 `"en"`。运行时切换语言建议重新挂载编辑器。 |
| `inner-toc` | `true` | 显示内置右侧目录。传 `:inner-toc="false"` 后可通过 `on-toc-change` 或 `runtimeSnapshot.toc` 自行渲染目录。 |
| `inner-toc-placement` | `"container"` | 默认使目录始终相对视觉窗口垂直居中，并通过对称目录留白保持正文居中；实际编辑器容器较窄时会自动隐藏内置目录，优先保证正文可读性。仅在确实需要固定于视口右侧时传 `inner-toc-placement="viewport"`。 |
| `auto-focus-first-table-body-cell` | `false` | 适合 playground 或表格优先文档。 |

## 上传 API

图片和视频支持 URL、绝对路径、相对路径、Base64、本地文件。本地文件必须由宿主通过 `on-slash-command-upload` 上传；URL/path/Base64 可以直接作为结果使用。

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

## 表格、AI 与复制回调

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

- `on-edit-with-ai` 接收表格行、列或选区上下文。
- `on-rewrite-selection` 和 `on-extract-to-note` 接收浮动工具栏中的选中文本和 HTML。
- `on-table-copy-payload` 接收复制行、列或整表时的文本与 HTML。
- `on-table-command-result` 接收表格命令执行结果和 before/after 快照。

## 能力覆盖

Vue 3 适配器提供完整 Markweave UI：浮动工具栏、链接弹层、slash 菜单、表格句柄和选区 overlay、代码块语言/复制控制、Mermaid Code/Preview/放大/下载、图片/视频 NodeView、数学公式编辑、Live/View 模式、内置 TOC、中英文 UI。

## 生产接入建议

- 用 `on-update` payload 中的 `markdown` 存储正文；其中受支持的 HTML fallback 属于无损 Markdown 格式本身，而不是另一种文档模式。
- 保存逻辑在宿主侧做 debounce。
- `@markweave/vue3/styles.css` 只导入一次。
- 即使宿主系统的中文回退字体没有原生斜体字形，行内斜体也会保持可见。
- 上传接口必须做认证、文件大小、MIME 类型和返回 URL 校验。
- 不要接受任意 iframe host。Markweave 只处理直接视频和受支持的 YouTube/Bilibili embed 形态。
- Markweave 面向浏览器运行；Nuxt 等 SSR 框架中应在客户端渲染编辑器。
- View 模式安全链接会拒绝 `javascript:`、`data:`、`vbscript:` 等不安全协议。
