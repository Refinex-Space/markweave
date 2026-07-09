---
owner: refinex
updated: 2026-07-09
status: active
referenced_by: docs/README.md#knowledge-map
---

# React 接入手册

语言：中文 | [English](./react-integration.md)

这是 Markweave 的 React 完整接入手册，覆盖安装、内容存储、Live/View 模式、上传、回调、表格、AI、TOC 和生产边界。仓库里的私有参考实现是 `apps/playground-react`。

## 安装

在已有 React 应用中安装 React 适配包：

```sh
pnpm add @markweave/react
```

`react` 和 `react-dom` 是宿主应用负责提供的 peer dependency：

```sh
pnpm add react react-dom
```

在应用入口或编辑器组件中导入一次样式：

```tsx
import "@markweave/react/styles.css";
```

## 最小编辑器

```tsx
import { MarkweaveEditor, type MarkweaveEditorUpdatePayload } from "@markweave/react";
import "@markweave/react/styles.css";

const initialMarkdown = `# Product Notes

Write in **Markdown**, edit visually, and store Markdown.`;

export function ProductEditor() {
  function handleUpdate(payload: MarkweaveEditorUpdatePayload) {
    saveDraft(payload.markdown);
  }

  return (
    <MarkweaveEditor
      ariaLabel="Product notes editor"
      defaultContent={initialMarkdown}
      onUpdate={handleUpdate}
    />
  );
}

function saveDraft(markdown: string) {
  console.log(markdown);
}
```

`defaultContent` 默认按 Markdown 解析。产品侧建议把 `payload.markdown` 作为主存储格式；`payload.html`、`payload.json`、`payload.text` 适合用于预览、索引或集成。

## 内容 API

| 属性 / API | 默认值 | 用途 |
| --- | --- | --- |
| `defaultContent` | `""` | 非受控初始内容。除非声明 `defaultContentFormat`，否则按 Markdown 解析。 |
| `defaultContentFormat` | `"markdown"` | 旧 HTML 传 `"html"`；Tiptap JSON 传 `"json"`。 |
| `content` | `undefined` | 受控内容。除非声明 `contentFormat`，否则按 Markdown 解析。 |
| `contentFormat` | `"markdown"` | 受控内容格式。 |
| `onUpdate(payload)` | `undefined` | 保存 `payload.markdown`；按需读取 `html`、`json` 或 `text`。 |

受控 Markdown 示例：

```tsx
import { useState } from "react";
import { MarkweaveEditor, type MarkweaveEditorUpdatePayload } from "@markweave/react";

export function ControlledEditor({ value }: { value: string }) {
  const [markdown, setMarkdown] = useState(value);

  function handleUpdate(payload: MarkweaveEditorUpdatePayload) {
    setMarkdown(payload.markdown);
  }

  return (
    <MarkweaveEditor
      content={markdown}
      contentFormat="markdown"
      onUpdate={handleUpdate}
    />
  );
}
```

旧 HTML 内容必须显式声明格式：

```tsx
<MarkweaveEditor
  defaultContent="<h1>Hello Markweave</h1>"
  defaultContentFormat="html"
/>
```

高级自定义壳层可以使用 `useMarkweaveEditorController`，其中 `actions.setContent(content, { format, emitUpdate, focusFirstTableBodyCell })` 可用于命令式设置内容。普通产品接入推荐直接使用 `MarkweaveEditor`，因为它已经渲染完整的 toolbar、slash 菜单、表格控制、代码块控制、数学公式编辑、媒体 NodeView 和 TOC。

## 模式、语言与目录

```tsx
<MarkweaveEditor
  defaultContent="# Spec\n\n## Goals"
  mode="live"
  lang="zh"
  innerToc
  onTocChange={({ items, activeId }) => {
    console.log(items, activeId);
  }}
  onRuntimeStateChange={(snapshot) => {
    console.log(snapshot.mode, snapshot.editable, snapshot.toc);
  }}
/>
```

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `mode` | `"live"` | `"live"` 可编辑；`"view"` 只读，但保留安全链接打开、代码复制、Mermaid 预览/放大/下载、媒体播放和 TOC 跳转等阅读能力。 |
| `editable` | `true` | 兼容锁。最终可编辑状态是 `mode === "live" && editable !== false`。 |
| `lang` | `"zh"` | UI 语言。支持 `"zh"` 和 `"en"`。运行时切换语言建议重新挂载编辑器。 |
| `innerToc` | `true` | 显示内置右侧目录。传 `false` 后可通过 `onTocChange` 或 `runtimeSnapshot.toc` 自行渲染目录。 |
| `autoFocusFirstTableBodyCell` | `false` | 适合 playground 或表格优先文档。 |

## 上传 API

图片和视频支持 URL、绝对路径、相对路径、Base64、本地文件。本地文件必须由宿主通过 `onSlashCommandUpload` 上传；URL/path/Base64 可以直接作为结果使用。

```tsx
import {
  MarkweaveEditor,
  type MarkweaveSlashCommandUploadHandler,
  type MarkweaveUploadRequest,
  type MarkweaveUploadResult,
} from "@markweave/react";

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

export function EditorWithUploads() {
  return <MarkweaveEditor onSlashCommandUpload={handleUpload} />;
}
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

图片在 Live 模式下支持对齐、Caption、缩放、替换、下载和删除。视频支持本地上传、直接视频 URL、YouTube embed URL、Bilibili player URL、普通 YouTube/Bilibili 分享链接。附件节点可以渲染已有 attachment HTML fallback；默认 slash Attachment 入口目前是禁用状态，但 `attachment` 仍保留在公开上传协议中，方便宿主后续扩展。

## 表格、AI 与复制回调

```tsx
<MarkweaveEditor
  onEditWithAi={(request) => {
    console.log(request.source, request.text, request.html);
  }}
  onRewriteSelection={(request) => {
    console.log(request.text);
  }}
  onExtractToNote={(request) => {
    console.log(request.html);
  }}
  onTableCopyPayload={(payload) => {
    console.log(payload.kind, payload.text, payload.html);
  }}
  onTableCommandResult={(result) => {
    console.log(result.commandId, result.success, result.before, result.after);
  }}
/>
```

- `onEditWithAi` 接收表格行、列或选区上下文。
- `onRewriteSelection` 和 `onExtractToNote` 接收浮动工具栏中的选中文本和 HTML。
- `onTableCopyPayload` 接收复制行、列或整表时的文本与 HTML。
- `onTableCommandResult` 接收表格命令执行结果和 before/after 快照。

## 能力覆盖

React 适配器提供完整 Markweave UI：浮动工具栏、链接弹层、slash 菜单、表格句柄和选区 overlay、代码块语言/复制控制、Mermaid Code/Preview/放大/下载、图片/视频 NodeView、数学公式编辑、Live/View 模式、内置 TOC、中英文 UI。

## 生产接入建议

- 用 `onUpdate.markdown` 存储正文；HTML 只作为派生输出。
- 保存逻辑在宿主侧做 debounce。
- `@markweave/react/styles.css` 只导入一次。
- 上传接口必须做认证、文件大小、MIME 类型和返回 URL 校验。
- 不要接受任意 iframe host。Markweave 只处理直接视频和受支持的 YouTube/Bilibili embed 形态。
- Markweave 面向浏览器运行；SSR 框架中应在客户端渲染编辑器。
- View 模式安全链接会拒绝 `javascript:`、`data:`、`vbscript:` 等不安全协议。
