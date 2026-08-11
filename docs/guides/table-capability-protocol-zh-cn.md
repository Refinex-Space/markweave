---
owner: refinex
updated: 2026-08-11
status: active
referenced_by: docs/README.md#knowledge-map
---

# 宿主表格能力约束协议

语言：中文 | [English](./table-capability-protocol.md)

Markweave 0.7.0 允许宿主针对“当前选区所在的表格”约束 Markweave 自身提供的表格操作。典型场景是：宿主自定义节点内部使用 Markweave 原生 `table`，但该表格的列结构代表业务模板协议，不能被用户当作普通 Markdown 表格任意增删。

Markweave 仍然不理解业务。宿主根据只读节点描述识别自己的容器并返回能力；字段定义、动态行数据、工作流规则、权限和后端 API 都不进入编辑器协议。

## 编辑器属性

```ts
import type { MarkweaveTableCapabilityResolver } from "@markweave/vue2";

export const tableCapabilities: MarkweaveTableCapabilityResolver = ({ ancestors }) => {
  const insideRepeatTemplate = ancestors.some(
    (node) => node.type === "decisionRepeatContainer",
  );

  return insideRepeatTemplate
    ? { structure: false, askAi: false }
    : undefined;
};
```

React 使用 `tableCapabilities={tableCapabilities}`；Vue 2/Vue 3 使用 callback prop：`:table-capabilities="tableCapabilities"`。三个适配器的 Extension 工厂以及框架无关的 `createMarkweaveEditorExtensions` 也接受同名选项。

回调不会收到 `Editor`、Transaction、DOM 节点、Token、Cookie 或请求客户端，只接收以下只读上下文：

```ts
interface MarkweaveTableCapabilityContext {
  readonly table: {
    readonly type: string;
    readonly attrs: Readonly<Record<string, unknown>>;
  };
  readonly ancestors: readonly {
    readonly type: string;
    readonly attrs: Readonly<Record<string, unknown>>;
  }[];
}
```

`ancestors` 从最外层文档子节点排列到表格的直接父节点。节点描述和属性是浅只读快照，不暴露 ProseMirror Node。

## 能力定义

未返回的能力默认都是 `true`：

| 能力 | 约束范围 |
| --- | --- |
| `structure` | Markweave 提供的插入、移动、排序、清空、复制、删除、合并和拆分菜单命令；行列拖拽；末行/末列边缘加号；最后一个单元格按 `Tab` 自动增行；选区已在该表格内时粘贴独立表格。单元格内直接编辑文字仍然可用。 |
| `formatting` | Markweave 行列颜色、水平/垂直对齐菜单及其运行时操作。 |
| `copy` | Markweave 的整表、整行、整列复制菜单和单元格选区复制处理。它只是交互能力，不是防泄漏安全边界。 |
| `askAi` | Markweave 表格 Ask AI 菜单与目标捕获。 |

返回 `undefined` 或 `null` 表示使用默认能力。resolver 抛异常或运行时返回非对象值时，当前表格的所有能力都会 fail-closed。resolver 必须同步、快速、无副作用，因为菜单展示、快捷键和命令执行都可能重复查询它。

## 约束边界

Markweave 会在“展示操作入口”和“真正执行操作”两个阶段都检查能力，避免旧菜单、快捷键或拖拽绕过最新策略。命令、键盘、剪贴板和表格动作的约束属于共享核心；React、Vue 2、Vue 3 只负责一致渲染。

该协议不是鉴权机制，也不会沙箱化受信任的宿主代码。宿主如果拿到公开 Editor Controller，仍可直接调用原生 Tiptap 命令、整体替换内容或重建 schema。后端认证、授权和业务校验仍由接入方负责。

## 动态明细模板推荐结构

使用一个非原子的宿主容器包裹 Markweave 原生表格：

```text
decisionRepeatContainer
└── table
    ├── tableRow -> tableHeader...
    └── tableRow -> decisionRepeatField...
```

动态明细元数据放在宿主容器，列字段元数据放在宿主字段节点，嵌套表格的展示、编辑和 Markdown 序列化继续使用 Markweave 原生能力。模板场景通常对该祖先节点返回 `{ structure: false, askAi: false }`。运行期业务行、稳定 `rowGuid`、校验和导出数据必须继续使用宿主结构化数据，不能反向从 Markdown 表格推断。
