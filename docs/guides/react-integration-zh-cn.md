---
owner: refinex
updated: 2026-08-04
status: active
referenced_by: docs/README.md#knowledge-map
---

# React 接入手册

语言：中文 | [English](./react-integration.md)

这是 Markweave 的 React 完整接入手册，覆盖安装、内容存储、Live/View 模式、上传、回调、表格、AI、TOC 和生产边界。仓库里的私有参考实现是 `apps/playground-react`。

对于约 200 KB 以上的文档，优先使用非受控 `defaultContent`。`onUpdate` 只保留最新惰性 payload，不要在每个事务读取 `payload.markdown`；宿主应在 idle、手动保存或导航 flush 边界只序列化一次。持久化媒体 URL 需要映射为展示 URL 时传入 `resolveMediaSource`：请求包含 `visible | nearby | background` 优先级与 `AbortSignal`，结果可返回固有 `width`/`height`。解析出的展示 URL 不会写回节点或 Markdown。

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

`defaultContent` 默认按 Markdown 解析。产品侧建议把 `payload.markdown` 作为主存储格式；Markweave 会优先输出标准 Markdown，仅在文字/高亮颜色、块对齐、合并单元格等标准 Markdown 无法表达的状态下输出原生 HTML fallback。`payload.html`、`payload.json`、`payload.text` 仍适合用于预览、索引或集成。更新载荷按字段惰性序列化并缓存，因此只读取 `markdown` 不会额外生成 HTML、JSON 或纯文本；受控模式直接回传该字段时也会避免重复内容比较。

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

宿主如需实现文档内查找/替换 UI，可通过 `onSearchControllerChange` 保存共享搜索 controller。调用 `subscribe` 同步结果计数，通过 `setQuery`/`setOptions` 更新查询，使用 `findNext`/`findPrevious` 导航，并在可编辑模式调用 `replaceCurrent`/`replaceAll`。关闭搜索栏时调用 `clear` 移除全部搜索 Decoration。

## 模式、语言与目录

```tsx
<MarkweaveEditor
  defaultContent="# Spec\n\n## Goals"
  mode="live"
  theme="dark"
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
| `theme` | `"light"` | `"light"` 或 `"dark"`。主题仅作用于当前编辑器根节点，可在运行时切换，不会重建文档内容。 |
| `canvasColor` | 主题默认值 | 仅覆盖编辑器画布的可选 CSS 颜色/变量。亮色默认透明，暗色默认 `#181A1F`；例如可传 `"#000"` 或 `"var(--app-canvas)"`，运行时切换不会重建编辑器。 |
| `editable` | `true` | 兼容锁。最终可编辑状态是 `mode === "live" && editable !== false`。 |
| `lang` | `"zh"` | UI 语言。支持 `"zh"` 和 `"en"`。运行时切换语言建议重新挂载编辑器。 |
| `innerToc` | `true` | 显示内置右侧目录。传 `false` 后可通过 `onTocChange` 或 `runtimeSnapshot.toc` 自行渲染目录。 |
| `innerTocPlacement` | `"container"` | 默认使目录始终相对视觉窗口垂直居中，并通过对称目录留白保持正文居中；实际编辑器容器较窄时会自动隐藏内置目录，优先保证正文可读性。仅在确实需要固定于视口右侧时传 `"viewport"`。 |
| `autoFocusFirstTableBodyCell` | `false` | 适合 playground 或表格优先文档。 |

## 上传 API

图片和视频支持 URL、绝对路径、相对路径、Base64、本地文件。本地文件必须由宿主通过 `onSlashCommandUpload` 上传；URL/path/Base64 可以直接作为结果使用。

Live 模式下，粘贴本地 `image/*` 剪贴板文件会按顺序插入全部图片，并通过同一个 `onSlashCommandUpload` 处理器逐个上传，请求使用 `kind: "image"` 和 `trigger: "image-insert"`。仅包含图片的 HTML `<img>` 剪贴板内容在来源为 HTTP(S) 时直接插入；单独的 HTTP(S) URL 只有路径带常见图片扩展名时才转换为图片，Markweave 不会请求远端判断类型。同一次剪贴板同时存在文件和 HTML/URL 表示时优先处理文件，避免重复插入。

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

图片在 Live 模式下支持预览、对齐、Caption、缩放、替换、下载和删除；View 模式下 Hover 图片右上角会出现预览入口，可打开支持缩放与拖拽平移的大图预览。视频支持本地上传、直接视频 URL、YouTube embed URL、Bilibili player URL、普通 YouTube/Bilibili 分享链接。附件节点可以渲染已有 attachment HTML fallback；默认 slash Attachment 入口目前是禁用状态，但 `attachment` 仍保留在公开上传协议中，方便宿主后续扩展。

## Ask AI

Ask AI 默认关闭并采用 fail-closed 策略：只有接入方显式启用且提供有效 handler，选中文本工具条才显示入口。

```tsx
<MarkweaveEditor
  askAi={{
    enabled: true,
    handler: async ({ signal, ...request }) => {
      const response = await fetch("/api/markweave/ask-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      if (!response.ok) throw new Error("Ask AI failed");
      return response.text(); // Markdown，也可返回 AsyncIterable<string>
    },
  }}
/>
```

同一个 handler 同时处理文本与表格目标。普通文本请求的 `request.target` 为 `{ kind: "text" }`；表格请求只携带当前目标的 `scope`、精确 `rows`/`columns`、Markdown、HTML 与单元格元数据。原有 `selection` 字段继续作为扁平兼容投影，请求不会包含整篇文档或目标外上下文。单单元格目标返回 Markdown 片段；行、列、多单元格选区与整表目标返回精确等形的 GFM 表格。

生成内容在用户接受前只进入临时预览；接受后用一次可撤销事务替换文本或目标单元格内容，表格节点类型、合并关系、列宽、颜色与对齐属性保持不变。等待期间如果目标内容被修改，请求会中止并阻止覆盖。代码块、原子/媒体节点、View 模式、空文本选区和包含合并单元格的多单元格目标保持 fail-closed；单个合并单元格仍可使用。

`onRewriteSelection` 和 `onExtractToNote` 作为兼容性旧回调继续保留；新的自定义 Prompt 写作流程应使用 `askAi`。

## 宿主驱动 AI 预编辑协议

当宿主已经有自己的 AI 入口、Agent 或对话面板时，使用 `MarkweaveAiEditController`，无需启用内置 `askAi`。宿主读取受支持的选区、自行调用任意供应商并返回 Markdown；Markweave 只负责目标映射、原位审阅、接受、舍弃与冲突保护，不会发送模型请求或接收供应商密钥。

### 控制器生命周期与完整响应

编辑器创建后，`onAiEditControllerChange` 会传入控制器；编辑器销毁或重建前会传入 `null`。每次回调都应替换宿主保存的引用，收到 `null` 后不得继续复用旧控制器。

```tsx
import { useState } from "react";
import {
  MarkweaveEditor,
  type MarkweaveAiEditController,
  type MarkweaveAiEditContext,
} from "@markweave/react";

export function AiDocumentEditor() {
  const [aiEdit, setAiEdit] = useState<MarkweaveAiEditController | null>(null);

  async function reviseSelection() {
    const controller = aiEdit;
    if (!controller) return;

    const captured = controller.captureSelection({ metadata: { action: "revise" } });
    if (!captured.ok) {
      console.warn(captured.code, captured.message);
      return;
    }
    const { id, lang, selection, signal } = captured.value;

    try {
      const response = await fetch("/api/document-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, lang, selection, instruction: "改写得更清晰" }),
        signal,
      });
      if (!response.ok) throw new Error("AI edit failed");
      const markdown = await response.text();

      const completed = controller.updateProposal({ contextId: id, markdown, status: "complete" });
      if (!completed.ok) console.warn(completed.code, completed.message);
    } catch (error) {
      if (!signal.aborted) {
        controller.failProposal(id, error instanceof Error ? error.message : undefined);
      }
    }
  }

  return <MarkweaveEditor onAiEditControllerChange={setAiEdit} />;
}
```

`captureSelection()` 继续只捕获精确普通文本选区。宿主可通过 `getSelection()` / `subscribeSelection()` 按需读取选区正文与规范化 Markdown 的 1-based 块级 `lineRange`，而不会把正文塞入高频 runtime snapshot。

需要修改所选段落或全文多处内容时，调用 `capture({ scope: "blocks" | "document" })`；`blocks` 扩展到覆盖的顶层块，`document` 不要求选区但必须由宿主显式触发。AI 应返回捕获范围修改后的完整 Markdown，不返回 ProseMirror 位置或补丁。Markweave 在 `complete` 后计算并展示最多 200 个结构化 hunk，接受时一次事务应用全部变更并通过 `appliedRanges` 报告范围。流式阶段不会提前展示不完整的全文 Diff。

不要用捕获时的数字位置自行修改文档；应调用 `accept(contextId)`。

### 累计流式响应

流式接入时，每次必须传入当前累计的完整 Markdown，而不是单个 token；结束时必须再提交一次 `complete`：

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

精确选区在流式中保留上一次有效局部预览；`blocks/document` 只在最终 `complete` 后展示多处 Diff。最终 Markdown 必须能被解析并满足当前 schema；否则原文保持不变。

### 默认操作条与 headless 模式

`captureSelection()` 默认使用 `controls: "default"`，Markweave 会在编辑器当前可视边界的右下角渲染唯一的紧凑决策条。决策条通过 Portal 挂载到 `body`，长文档或多 hunk 提案滚动时仍保持可见，并会在裁剪容器滚动、窗口缩放、重新聚焦和页面重新激活后重新定位；提案文字与主操作按钮使用 Chromium 106 可稳定计算的兼容色值。“停止”和“舍弃”都会取消当前上下文。`captureSelection({ controls: "none" })` 只隐藏该决策条；有效提案仍在原位置显示。

自定义操作界面应先调用 `getState()` 读取初始快照，再通过 `subscribe()` 接收后续变化；`subscribe()` 不会主动回放当前状态。宿主界面卸载时必须注销状态和决策监听：

```ts
const captured = controller.captureSelection({ controls: "none" });
if (captured.ok) {
  renderAiEditState(controller.getState());
  const unsubscribeState = controller.subscribe(renderAiEditState);
  const unsubscribeDecision = controller.onDecision((decision) => {
    console.log(decision.decision, decision.appliedRange, decision.metadata);
  });

  // 宿主界面卸载时：
  // unsubscribeState();
  // unsubscribeDecision();
}
```

只有 phase 为 `review` 时才能调用 `accept(contextId)`；任意活动 phase 均可调用 `discard(contextId)`。`failProposal` 只进入 `error`，不会替换文档，宿主可以使用同一 context 重试或舍弃。

### 状态、错误码与安全规则

phase 包括 `idle`、`captured`、`streaming`、`review`、`error` 和 `conflict`。每个编辑器同时只允许一个活动上下文：

| 错误码 | 含义 |
| --- | --- |
| `readonly` | 编辑器不处于可编辑的 Live 模式。 |
| `no-selection` | 当前选区为空。 |
| `unsupported-selection` | 目标为代码块、表格/单元格、媒体/原子节点、`NodeSelection` 或 `CellSelection`。 |
| `unsupported-scope` | 请求的捕获范围无法建立。 |
| `active-review` | 已存在 captured、streaming、review 或 error 上下文，必须先接受或舍弃。 |
| `stale-context` | 上下文已舍弃、接受、替换或销毁，迟到结果必须忽略。 |
| `invalid-markdown` | 完整结果无法解析为 Markdown。 |
| `schema-incompatible` | 解析结果不能由当前编辑器 schema 表示。 |
| `incomplete-proposal` | 完整结果为空，或尚未进入 review 就请求接受。 |
| `proposal-too-complex` | 多范围 Diff 超过安全复杂度或 hunk 上限。 |
| `conflict` | 宿主处理期间目标选区内容发生变化。 |

目标外编辑会映射活动范围；目标内部编辑、切换到 View、停止/舍弃或销毁编辑器都会中止上下文的 `AbortSignal`。`selection` 仍拒绝代码块、表格和媒体目标；`blocks/document` 可携带未改变的复杂结构并校验完整提案。预览、错误、冲突和舍弃不改变文档或撤销历史；接受只产生一次事务和一次 Undo。

## 表格、兼容 AI 回调与复制回调

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

- `onEditWithAi` 作为废弃兼容属性继续保留，但内置表格菜单不再渲染该旧入口；新接入统一使用 `askAi` handler。
- `onRewriteSelection` 和 `onExtractToNote` 是兼容性旧回调。
- `onTableCopyPayload` 接收复制行、列或整表时的文本与 HTML。
- `onTableCommandResult` 接收表格命令执行结果和 before/after 快照。

内置表格控制采用 Notion-like 的行、列与选区句柄。启用 `askAi` 后，`Ask AI` 会成为行、列、单元格/选区与整表菜单的首项。行列菜单同时覆盖移动、插入、排序、颜色、对齐、清空、复制与删除；选区菜单继续保留合并、拆分、复制与删除。Hover 最后一行或最后一列会显示整边快捷新增控件，拖拽行列句柄可直接调整顺序；全部菜单名称跟随 `lang`（`zh` 或 `en`）。

## 外部超链接卡片

只有段落内容恰好为一个 HTTP(S) 链接时才可转为卡片；行内链接、混合文本链接与 `markweave:` 链接保持普通链接。通过 `linkCardResolver` 在用户主动嵌入或修改卡片后补充元数据：

```tsx
<MarkweaveEditor linkCardResolver={async ({ href, title, signal }) => {
  const response = await fetch(`/api/link-preview?url=${encodeURIComponent(href)}`, { signal });
  return response.ok ? response.json() : null;
}} />
```

resolver 不会在文档加载、滚动或普通链接点击时调用。它收到的是已校验 HTTP(S) URL；生产环境必须由后端抓取服务实现 URL/DNS 白名单、重定向与超时限制、响应体大小限制和图片 URL 校验。Markweave 核心不会自行访问外链。

## 能力覆盖

React 适配器提供完整 Markweave UI：浮动工具栏、链接弹层、slash 菜单、表格句柄和选区 overlay、代码块语言/复制控制、Mermaid Code/Preview/放大/下载、图片/视频 NodeView、数学公式编辑、Live/View 模式、内置 TOC、中英文 UI。

## 生产接入建议

- 用 `onUpdate.markdown` 存储正文；其中受支持的 HTML fallback 属于无损 Markdown 格式本身，而不是另一种文档模式。
- 保存逻辑在宿主侧做 debounce。
- `@markweave/react/styles.css` 只导入一次。
- 即使宿主系统的中文回退字体没有原生斜体字形，行内斜体也会保持可见。
- 上传接口必须做认证、文件大小、MIME 类型和返回 URL 校验。
- 不要接受任意 iframe host。Markweave 只处理直接视频和受支持的 YouTube/Bilibili embed 形态。
- Markweave 面向浏览器运行；SSR 框架中应在客户端渲染编辑器。
- View 模式安全链接会拒绝 `javascript:`、`data:`、`vbscript:` 等不安全协议。
