---
owner: refinex
updated: 2026-08-13
status: active
referenced_by: docs/README.md#knowledge-map
---

# 通用命令与宿主 Extension 接入协议

语言：中文 | [English](./command-extension-protocol.md)

Markweave 0.6.0 允许宿主把业务命令注册到 Slash 菜单和外部工具栏，并通过稳定的 `MarkweaveCommandController` 调用同一执行路径。高级宿主还可以在编辑器创建时追加受信任的 Tiptap Extension。命令处理器和 Extension 都是宿主代码；Markweave 不接收 Token、Cookie、`CurrentUser`、请求客户端或业务权限规则。

## 编辑器属性

| 属性 | 说明 |
| --- | --- |
| `commandGroups` | 宿主命令组。组 ID 必须是小写点分命名空间。 |
| `commands` | 宿主命令描述和处理器。命令 ID 必须是小写点分命名空间。 |
| `builtinCommands` | 用 `include` 或 `exclude` 控制内置命令可见性；两者不能同时使用。 |
| `editorExtensions` | 只在 Editor 创建时追加 Extension；运行时更换数组不会热插拔。 |
| `onCommandControllerChange` | 创建后收到稳定 Controller；销毁或 keyed remount 前收到 `null`。 |
| `onCommandError` | 接收安全错误码和安全消息，不包含 handler 原始异常文本。 |

React 使用 camelCase。Vue 2/Vue 3 使用同一 callback prop，模板绑定示例是 `:command-groups`、`:builtin-commands`、`:editor-extensions`、`:on-command-controller-change` 和 `:on-command-error`；没有另一套 Vue emit 协议。

## 注册命令

```ts
import type {
  MarkweaveCommandGroupSpec,
  MarkweaveCommandSpec,
} from "@markweave/react";

export const commandGroups: readonly MarkweaveCommandGroupSpec[] = [
  { id: "trm.decision", label: "决策字段", order: 250 },
];

export const commands: readonly MarkweaveCommandSpec[] = [
  {
    id: "trm.decision.insert-field",
    label: "插入决策字段",
    description: "异步选择字段并插入 Markdown。",
    groupId: "trm.decision",
    order: 10,
    keywords: ["field", "字段"],
    icon: { kind: "text", text: "字段" },
    payloadSchemaId: "trm.decision.field.v1",
    async execute({ source, payload, query, context, signal }) {
      const field = await selectField({ payload, query, signal });
      if (!field) return { kind: "cancel" };

      return {
        kind: "apply",
        content: { format: "markdown", value: `**${field.label}**` },
        placement: source === "slash" ? "replace-trigger" : "insert-at-cursor",
        selection: "after",
      };
    },
  },
];
```

ID 只能使用类似 `trm.decision.insert-field` 的小写点分命名空间。重复 ID、覆盖内置 ID、未知组、非法 surface/icon 以及同时配置 include/exclude 都会失败关闭。文本图标去空白后只能包含 1–4 个 Unicode 字符；标签、描述、组名和图标都按纯文本渲染，不接受 HTML、SVG 或 URL。

`surfaces` 默认是 `['slash', 'api']`。`payloadSchemaId` 只是宿主类型和诊断标识，Markweave 不解释业务 payload。`isVisible`、`isEnabled`、`getDisabledReason` 只接收当前只读上下文，必须同步、快速且无副作用；它们不是权限边界。

## Controller

```tsx
const [commands, setCommands] = useState<MarkweaveCommandController | null>(null);

<MarkweaveEditor
  commandGroups={commandGroups}
  commands={hostCommands}
  builtinCommands={{ exclude: ["video"] }}
  onCommandControllerChange={setCommands}
  onCommandError={(error) => reportCommandError(error.code, error.message)}
/>

<button
  disabled={!commands}
  onClick={() => void commands?.execute("trm.decision.insert-field", {
    payload: { fieldType: "owner" },
  })}
>
  插入字段
</button>
```

Controller 提供：

- `getCommands({ surface, query })`：返回当前上下文下可见、已排序的只读命令视图。
- `execute(commandId, { payload })`：API 调用入口，始终返回结构化结果。
- `getState()` / `subscribe(listener)`：读取或监听 `idle | running | applying`。
- `cancel(executionId?)`：中止当前执行；Slash 执行期间按 Escape 也会调用取消。

成功结果是 `outcome: 'applied'`，handler 主动返回 `{ kind: 'cancel' }` 时是 `outcome: 'cancelled'`。普通失败不会作为 Promise rejection 泄漏，错误码包括 `COMMAND_NOT_FOUND`、`COMMAND_DISABLED`、`COMMAND_BUSY`、`COMMAND_ABORTED`、`COMMAND_CONFLICT`、`INVALID_RESULT`、`HANDLER_FAILED` 和 `EDITOR_UNAVAILABLE`。

## 结果、位置与并发

首版只接受 `{ kind: 'cancel' }` 或 `{ kind: 'apply' }`。`apply.content.format` 只能是 `text`、`markdown`、`json`；HTML、空内容、循环 JSON、未知 kind、非法 schema 和超过固定 1 MiB 的单次结果都会返回 `INVALID_RESULT`。1 MiB 只限制一次命令结果，不限制全文，也不改变现有 200 KB 大文档调度阈值。

位置规则：

- Slash 默认 `replace-trigger`；只有成功应用才删除 `/query`。
- API 默认 `insert-at-cursor`；API 返回 `replace-trigger` 时按 `insert-at-cursor` 处理。
- `replace-selection` 使用调用开始时捕获并持续映射的选区。
- `insert-at-cursor` 使用调用开始时真实 selection head。
- 默认把选区放到插入内容之后；`selection: 'preserve'` 映射原选区，目标被替换时退化为插入后光标。

同一 Editor 同时只运行一个命令，不排队。目标外事务会映射锚点；目标区被覆盖、零长度锚点被触碰或整篇内容被替换时返回 `COMMAND_CONFLICT`。切换 View/只读、Registry 更新、Editor 销毁和显式取消都会中止 signal；迟到结果按 execution ID 丢弃。应用结果、替换目标和 selection 在一个事务中完成，因此只有一次 Undo；失败、取消和冲突不写文档或历史。

## 高级 editorExtensions

`editorExtensions` 是 additive-only 的受信任构建时代码：

```tsx
<MarkweaveEditor
  key={schemaVersion}
  editorExtensions={[DecisionFieldNode, DecisionBlockNode]}
/>
```

宿主 Extension 在 Markweave 内置扩展和框架媒体/LinkCard 扩展之后追加。创建前会扁平化 StarterKit 子扩展和宿主扩展；任何同名 Node、Mark、Extension 或内部插件都会立即抛错，不能替换 `paragraph`、StarterKit、Markweave 内置节点或内部插件。

运行时更换数组不会修改现有 schema，宿主必须改变 `key` 完整重建 Editor。自定义 Node 必须同时验证 Markdown tokenizer/parse/render、HTML parse/render、JSON schema、Markdown 往返和 View 模式。对于可能进入文字颜色、块对齐、缩进、上标/下标、合并或样式化表格等原生 HTML fallback 的节点，`renderHTML` 必须输出稳定的节点判别属性和完整业务属性，`parseHTML` 必须据此无损重建节点；Markweave 会使用包含宿主 Extension 的完整 Schema 生成 fallback，而不是把未知节点降级为空文本。宿主必须与当前 Markweave 包解析到同一个 Tiptap 实例；不承诺跨 Tiptap 主版本兼容。

## 安全边界

- predicate 只控制界面可见性和可用性，业务写接口仍须独立认证、授权和审计。
- handler 原始异常不会进入安全错误消息；宿主应在自己的边界记录敏感诊断。
- 命令 metadata 始终按文本渲染，不要把不可信 HTML/SVG 注入命令描述。
- Extension 能执行任意构建时代码，只能加载受信任、受版本控制的宿主实现。
