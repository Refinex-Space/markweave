// @vitest-environment jsdom

import { Editor, Node } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  getMarkweaveTableCapabilityContext,
  isMarkweaveTableCapabilityAllowed,
  type MarkweaveTableCapabilityContext,
} from "../src/plugins/table/table-capabilities";
import { runMarkweaveTablePaste } from "../src/plugins/table/table-clipboard";
import { runMarkweaveTableTab } from "../src/plugins/table/table-keyboard";
import { applyTableAxisAlignment } from "../src/plugins/table/table-formatting";
import {
  canRunTableCommand,
  getTableMenuItems,
  runTableCommand,
  selectTableAxisFromCell,
} from "../src/plugins/table/table-ui-model";

const DecisionRepeatContainer = Node.create({
  name: "decisionRepeatContainer",
  group: "block",
  content: "table",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      code: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-decision-repeat]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-decision-repeat": "true" }, 0];
  },
});

const repeatTableFixture = `
<section data-decision-repeat="true" code="expense_items">
  <table>
    <tbody>
      <tr><th><p>项目</p></th><th><p>金额</p></th></tr>
      <tr><td><p>差旅费</p></td><td><p>100</p></td></tr>
    </tbody>
  </table>
</section>
`;

let activeEditor: Editor | null = null;

function createEditor(
  resolver?: (context: MarkweaveTableCapabilityContext) => {
    readonly structure?: boolean;
    readonly formatting?: boolean;
    readonly copy?: boolean;
    readonly askAi?: boolean;
  } | undefined,
) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions({
      tableCapabilities: resolver,
      editorExtensions: [DecisionRepeatContainer],
    }),
    content: repeatTableFixture,
  });
  return activeEditor;
}

function findTextPosition(editor: Editor, text: string) {
  let result: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    const index = node.isText && node.text ? node.text.indexOf(text) : -1;
    if (index >= 0) {
      result = pos + index + 1;
      return false;
    }
    return true;
  });
  if (result === null) throw new Error(`Expected text ${text}.`);
  return result;
}

function findCellPosition(editor: Editor, text: string) {
  let result: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if ((node.type.name === "tableCell" || node.type.name === "tableHeader") && node.textContent === text) {
      result = pos;
      return false;
    }
    return true;
  });
  if (result === null) throw new Error(`Expected cell ${text}.`);
  return result;
}

function rowCount(editor: Editor) {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "table") {
      count = node.childCount;
      return false;
    }
    return true;
  });
  return count;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("table capability policy", () => {
  it("provides readonly table and ancestor descriptors to the host resolver", () => {
    const resolver = vi.fn(() => ({ structure: false }));
    const editor = createEditor(resolver);
    editor.commands.setTextSelection(findTextPosition(editor, "差旅费"));

    const context = getMarkweaveTableCapabilityContext(editor.state);
    expect(context).toMatchObject({
      table: { type: "table" },
      ancestors: [{ type: "decisionRepeatContainer", attrs: { code: "expense_items" } }],
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context?.table.attrs)).toBe(true);
    expect(isMarkweaveTableCapabilityAllowed(editor.state, "structure")).toBe(false);
    expect(resolver).toHaveBeenCalledWith(context);
  });

  it("locks every Markweave-owned structural path while retaining copy and formatting", () => {
    const editor = createEditor((context) =>
      context.ancestors.some((node) => node.type === "decisionRepeatContainer")
        ? { structure: false, askAi: false }
        : undefined,
    );
    editor.commands.setTextSelection(findTextPosition(editor, "100"));
    const initialRows = rowCount(editor);

    expect(canRunTableCommand(editor, "add-row-after")).toBe(false);
    expect(canRunTableCommand(editor, "delete-table")).toBe(false);
    expect(canRunTableCommand(editor, "copy-table")).toBe(true);
    expect(runTableCommand(editor, "add-row-after")).toBe(false);
    expect(rowCount(editor)).toBe(initialRows);

    const rowCell = findCellPosition(editor, "差旅费");
    expect(selectTableAxisFromCell(editor, rowCell, "row")).toBe(true);
    expect(applyTableAxisAlignment(editor, "row", "center")).toBe(true);

    const rowMenu = getTableMenuItems(editor, "row", { askAiEnabled: true });
    expect(rowMenu.some((item) => item.commandId !== null)).toBe(false);
    expect(rowMenu.map((item) => item.submenuId).filter(Boolean)).toEqual(["color", "alignment"]);
    expect(rowMenu.some((item) => item.id === "edit-with-ai")).toBe(false);
  });

  it("prevents final-cell Tab growth and standalone table paste inside a locked table", () => {
    const editor = createEditor(() => ({ structure: false }));
    editor.commands.setTextSelection(findTextPosition(editor, "100") + 2);
    const initialRows = rowCount(editor);

    expect(runMarkweaveTableTab(editor)).toBe(true);
    expect(rowCount(editor)).toBe(initialRows);

    const clipboard = {
      getData: (type: string) => type === "text/plain" ? "| A | B |\n| --- | --- |\n| 1 | 2 |" : "",
    };
    expect(runMarkweaveTablePaste(editor, clipboard)).toBe(false);
    expect(rowCount(editor)).toBe(initialRows);
  });

  it("fails closed when the host resolver throws", () => {
    const editor = createEditor(() => {
      throw new Error("host policy failed");
    });
    editor.commands.setTextSelection(findTextPosition(editor, "差旅费"));

    expect(isMarkweaveTableCapabilityAllowed(editor.state, "structure")).toBe(false);
    expect(isMarkweaveTableCapabilityAllowed(editor.state, "formatting")).toBe(false);
    expect(isMarkweaveTableCapabilityAllowed(editor.state, "copy")).toBe(false);
    expect(isMarkweaveTableCapabilityAllowed(editor.state, "ask-ai")).toBe(false);
  });
});
