// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import {
  defaultSlashCommandSpecs,
  externalAiSlashCommandSpecs,
  filterSlashCommands,
  getLocalizedSlashCommandSpecs,
  isExecutableSlashCommand,
} from "../src/plugins/slash-command/command-spec";
import { getSlashCommandKeyboardAction, isSlashCommandMenuState } from "../src/plugins/slash-command/slash-keyboard";
import {
  executeSlashCommand,
  getNextSlashCommandState,
  getSlashCommandAnchoredMenuPosition,
  getSlashCommandContext,
  getSlashCommandOpenDecision,
} from "../src/plugins/slash-command/slash-runtime";
import { initialSlashCommandState, reduceSlashCommandState } from "../src/plugins/slash-command/slash-state";
import { getSlashCommandMenuPresentation } from "../src/react/ui/slash-command/SlashCommandMenu";

let activeEditor: Editor | null = null;

function createEditor(content: string) {
  const element = document.createElement("div");
  document.body.appendChild(element);

  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions(),
    content,
  });

  return activeEditor;
}

function textPosition(editor: Editor, text: string, boundary: "start" | "end" = "end") {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return true;
    }

    const offset = node.text.indexOf(text);
    if (offset < 0) {
      return true;
    }

    position = pos + offset + (boundary === "end" ? text.length : 0);
    return false;
  });

  if (position === null) {
    throw new Error(`Expected text "${text}" in the editor fixture.`);
  }

  return position;
}

function dispatchCompositionEvent(editor: Editor, type: "compositionstart" | "compositionend") {
  return editor.view.dom.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

function tableShape(editor: Editor) {
  const shapes: Array<{ rows: number; columns: number; rowWidths: number[] }> = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "table") {
      return true;
    }

    const rowWidths: number[] = [];
    node.forEach((row) => rowWidths.push(row.childCount));
    shapes.push({
      rows: node.childCount,
      columns: rowWidths[0] ?? 0,
      rowWidths,
    });
    return false;
  });

  return shapes;
}

function tableCellTextsByTable(editor: Editor) {
  const tables: string[][] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "table") {
      return true;
    }

    const cellTexts: string[] = [];
    node.descendants((child) => {
      if (child.type.name === "tableCell" || child.type.name === "tableHeader") {
        cellTexts.push(child.textContent);
        return false;
      }

      return true;
    });
    tables.push(cellTexts);
    return false;
  });

  return tables;
}

function codeBlockSnapshots(editor: Editor) {
  const snapshots: Array<{ language: string | null; mermaidPreviewMode?: string | null; text: string }> = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "codeBlock") {
      return true;
    }

    snapshots.push({
      language: node.attrs.language ?? null,
      mermaidPreviewMode: node.attrs.mermaidPreviewMode ?? null,
      text: node.textContent,
    });
    return false;
  });

  return snapshots;
}

function selectionAncestorNames(editor: Editor) {
  const ancestors: string[] = [];
  const $from = editor.state.selection.$from;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    ancestors.push($from.node(depth).type.name);
  }

  return ancestors;
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("slash command runtime", () => {
  it("detects a valid slash prefix and derives filtering state", () => {
    const editor = createEditor("<p>/ta</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/ta"))).toBe(true);

    const context = getSlashCommandContext(editor.state);
    const state = getNextSlashCommandState(initialSlashCommandState, context);

    expect(context).toMatchObject({ query: "ta", triggerFrom: textPosition(editor, "/ta", "start"), triggerTo: textPosition(editor, "/ta") });
    expect(state.name).toBe("filtering");
    expect(state.query).toBe("ta");
    expect(filterSlashCommands(state.query).map((command) => command.id)).toContain("table");
  });

  it("classifies valid slash positions inside nested editor textblocks", () => {
    const editor = createEditor(`
<p>/plain</p>
<ul><li><p>/list</p></li></ul>
<blockquote><p>/quote</p></blockquote>
<table>
  <tbody>
    <tr>
      <td><p>/cell</p></td>
    </tr>
  </tbody>
</table>
`);

    const cases = [
      { slashText: "/plain", query: "plain", scope: "paragraph" },
      { slashText: "/list", query: "list", scope: "list-item" },
      { slashText: "/quote", query: "quote", scope: "blockquote" },
      { slashText: "/cell", query: "cell", scope: "table-cell" },
    ] as const;

    for (const testCase of cases) {
      expect(editor.commands.setTextSelection(textPosition(editor, testCase.slashText))).toBe(true);
      expect(getSlashCommandOpenDecision(editor.state)).toMatchObject({
        canOpen: true,
        reason: "valid-textblock",
        scope: testCase.scope,
      });
      expect(getSlashCommandContext(editor.state)?.query).toBe(testCase.query);
    }
  });

  it("closes state when the cursor is no longer at a slash query", () => {
    const editor = createEditor("<p>/table</p><p>plain text</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/table"))).toBe(true);
    const openState = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));

    expect(editor.commands.setTextSelection(textPosition(editor, "plain text"))).toBe(true);

    expect(getSlashCommandContext(editor.state)).toBeNull();
    expect(getNextSlashCommandState(openState, null)).toBe(initialSlashCommandState);
  });

  it("does not open for code blocks, range selections, or active composition", () => {
    const codeEditor = createEditor('<pre><code>/table</code></pre>');
    expect(codeEditor.commands.setTextSelection(textPosition(codeEditor, "/table"))).toBe(true);
    expect(getSlashCommandOpenDecision(codeEditor.state)).toMatchObject({
      canOpen: false,
      reason: "code-block",
      scope: "code-block",
    });
    expect(getSlashCommandContext(codeEditor.state)).toBeNull();
    codeEditor.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const rangeEditor = createEditor("<p>/table</p>");
    const start = textPosition(rangeEditor, "/table", "start");
    const end = textPosition(rangeEditor, "/table");
    expect(rangeEditor.commands.setTextSelection({ from: start, to: end })).toBe(true);
    expect(getSlashCommandOpenDecision(rangeEditor.state)).toMatchObject({
      canOpen: false,
      reason: "range-selection",
      scope: null,
    });
    expect(getSlashCommandContext(rangeEditor.state)).toBeNull();
    rangeEditor.destroy();
    activeEditor = null;
    document.body.replaceChildren();

    const composingEditor = createEditor("<p>/table</p>");
    expect(composingEditor.commands.setTextSelection(textPosition(composingEditor, "/table"))).toBe(true);
    expect(dispatchCompositionEvent(composingEditor, "compositionstart")).toBe(true);
    expect(getSlashCommandOpenDecision(composingEditor.state)).toMatchObject({
      canOpen: false,
      reason: "active-composition",
      scope: null,
    });
    expect(getSlashCommandContext(composingEditor.state)).toBeNull();
    expect(dispatchCompositionEvent(composingEditor, "compositionend")).toBe(true);
    expect(getSlashCommandOpenDecision(composingEditor.state)).toMatchObject({
      canOpen: true,
      reason: "valid-textblock",
      scope: "paragraph",
    });
    expect(getSlashCommandContext(composingEditor.state)?.query).toBe("table");
  });

  it("executes the table command by deleting the slash query and inserting a structured table", () => {
    const editor = createEditor("<p>/table</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/table"))).toBe(true);
    const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
    const tableCommand = defaultSlashCommandSpecs.find((command) => command.id === "table");

    if (!tableCommand) {
      throw new Error("Expected table slash command.");
    }

    expect(executeSlashCommand(editor, state, tableCommand)).toBe(true);

    expect(editor.getText()).not.toContain("/table");
    expect(tableShape(editor)).toEqual([{ rows: 3, columns: 3, rowWidths: [3, 3, 3] }]);
    expect(selectionAncestorNames(editor)).toContain("tableCell");
    expect(selectionAncestorNames(editor)).not.toContain("tableHeader");
  });

  it("keeps focus in the table inserted by slash command when earlier tables already exist", () => {
    const editor = createEditor(`
<table>
  <tbody>
    <tr>
      <td><p>existing</p></td>
      <td><p>old</p></td>
    </tr>
  </tbody>
</table>
<p>/table</p>
`);
    expect(editor.commands.setTextSelection(textPosition(editor, "/table"))).toBe(true);
    const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
    const tableCommand = defaultSlashCommandSpecs.find((command) => command.id === "table");

    if (!tableCommand) {
      throw new Error("Expected table slash command.");
    }

    expect(executeSlashCommand(editor, state, tableCommand)).toBe(true);
    editor.commands.insertContent("new-cell");

    expect(tableCellTextsByTable(editor)[0]).toEqual(["existing", "old"]);
    expect(tableCellTextsByTable(editor)[1][3]).toBe("new-cell");
  });

  it("executes the blockquote command by deleting the slash query and preserving text input in the quote", () => {
    const editor = createEditor("<p>/quote</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/quote"))).toBe(true);
    const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
    const blockquoteCommand = defaultSlashCommandSpecs.find((command) => command.id === "blockquote");

    if (!blockquoteCommand) {
      throw new Error("Expected blockquote slash command.");
    }

    expect(filterSlashCommands("quote").map((command) => command.id)).toContain("blockquote");
    expect(executeSlashCommand(editor, state, blockquoteCommand)).toBe(true);
    editor.commands.insertContent("quoted text");

    expect(editor.getText()).not.toContain("/quote");
    expect(editor.getHTML()).toContain("<blockquote><p>quoted text</p></blockquote>");
    expect(selectionAncestorNames(editor)).toContain("blockquote");
  });

  it("exposes the Notion-like slash command inventory in fixed groups and order", () => {
    expect(defaultSlashCommandSpecs.map((command) => command.id)).toEqual([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "bullet-list",
      "ordered-list",
      "task-list",
      "blockquote",
      "code-block",
      "callout-info",
      "callout-tip",
      "callout-warning",
      "callout-error",
      "callout-success",
      "emoji",
      "table",
      "separator",
      "image",
      "video",
      "attachment",
    ]);
    expect(defaultSlashCommandSpecs.map((command) => command.group)).toEqual([
      "样式",
      "样式",
      "样式",
      "样式",
      "样式",
      "样式",
      "样式",
      "样式",
      "样式",
      "标注",
      "标注",
      "标注",
      "标注",
      "标注",
      "插入",
      "插入",
      "插入",
      "上传",
      "上传",
      "上传",
    ]);
    expect(filterSlashCommands("todo").map((command) => command.id)).toContain("task-list");
    expect(filterSlashCommands("待办").map((command) => command.id)).toContain("task-list");
    expect(filterSlashCommands("image").map((command) => command.id)).toContain("image");
    expect(filterSlashCommands("图片").map((command) => command.id)).toContain("image");
    expect(filterSlashCommands("divider").map((command) => command.id)).toContain("separator");
    expect(filterSlashCommands("upload").map((command) => command.id)).toEqual(["image", "video", "attachment"]);
    expect(defaultSlashCommandSpecs.find((command) => command.id === "attachment")).toMatchObject({
      disabled: true,
      disabledReason: "暂不可用。",
    });
    expect(getLocalizedSlashCommandSpecs("en").find((command) => command.id === "image")).toMatchObject({
      label: "Image",
      group: "Upload",
    });
  });

  it("executes heading 3, task list, separator, callout, emoji, and enabled upload commands", () => {
    const editor = createEditor("<p>/h3</p><p>/task</p><p>/sep</p><p>/callout</p><p>/emoji</p><p>/image</p><p>/video</p>");
    const runCommandAtText = (text: string, commandId: string, options = {}) => {
      expect(editor.commands.setTextSelection(textPosition(editor, text))).toBe(true);
      const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
      const command = defaultSlashCommandSpecs.find((candidate) => candidate.id === commandId);

      if (!command) {
        throw new Error(`Expected slash command ${commandId}.`);
      }

      expect(executeSlashCommand(editor, state, command, options)).toBe(true);
    };

    runCommandAtText("/h3", "heading-3");
    runCommandAtText("/task", "task-list");
    runCommandAtText("/sep", "separator");
    runCommandAtText("/callout", "callout-tip");
    runCommandAtText("/emoji", "emoji", { emoji: "✅" });
    runCommandAtText("/image", "image", { uploadResult: { src: "https://example.com/image.png", alt: "Example" } });
    runCommandAtText("/video", "video", { uploadResult: { src: "/video.mp4", name: "video.mp4", mimeType: "video/mp4" } });

    expect(editor.getHTML()).toContain("<h3></h3>");
    expect(editor.getHTML()).toContain('data-type="taskList"');
    expect(editor.getHTML()).toContain("<hr");
    expect(editor.getHTML()).toContain('data-markweave-callout-type="tip"');
    expect(editor.getText()).toContain("✅");
    expect(editor.getHTML()).toContain('src="https://example.com/image.png"');
    expect(editor.getHTML()).toContain('data-markweave-video="true"');
    expect(editor.getHTML()).not.toContain('data-markweave-attachment="true"');
  });

  it("keeps the disabled attachment command visible but non-executable", () => {
    const editor = createEditor("<p>/attachment</p>");
    const attachmentCommand = defaultSlashCommandSpecs.find((command) => command.id === "attachment");

    if (!attachmentCommand) {
      throw new Error("Expected attachment slash command.");
    }

    expect(filterSlashCommands("upload").map((command) => command.id)).toContain("attachment");
    expect(isExecutableSlashCommand(attachmentCommand)).toBe(false);

    expect(editor.commands.setTextSelection(textPosition(editor, "/attachment"))).toBe(true);
    const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));

    expect(getSlashCommandKeyboardAction({ ...state, activeIndex: 0 }, [attachmentCommand], "Enter")).toEqual({ type: "ignore" });
    expect(
      executeSlashCommand(editor, state, attachmentCommand, {
        uploadResult: { src: "./notes.pdf", name: "notes.pdf", mimeType: "application/pdf", size: 42 },
      }),
    ).toBe(false);
    expect(editor.getText()).toContain("/attachment");
    expect(editor.getHTML()).not.toContain('data-markweave-attachment="true"');
  });

  it("positions slash menus within the editor frame and flips near the lower boundary", () => {
    const frameRect = { left: 100, right: 700, top: 80, bottom: 480, width: 600, height: 400 };
    const topPosition = getSlashCommandAnchoredMenuPosition(
      { left: 120, right: 124, top: 100, bottom: 120, width: 4, height: 20 },
      { frameRect, viewportWidth: 800, viewportHeight: 600, menuWidth: 360, menuMaxHeight: 320 },
    );
    const bottomPosition = getSlashCommandAnchoredMenuPosition(
      { left: 680, right: 684, top: 455, bottom: 475, width: 4, height: 20 },
      { frameRect, viewportWidth: 800, viewportHeight: 600, menuWidth: 360, menuMaxHeight: 320 },
    );

    expect(topPosition).toMatchObject({ left: 118, triggerLeft: 118, triggerTop: 93, placement: "bottom" });
    expect(topPosition.top).toBe(135);
    expect(bottomPosition.placement).toBe("top");
    expect(bottomPosition.left).toBe(340);
    expect(bottomPosition.triggerLeft).toBe(576);
    expect(bottomPosition.top).toBe(440);
    expect(bottomPosition.top).toBeGreaterThanOrEqual(frameRect.top);
  });

  it("inserts an empty image placeholder without an upload result", () => {
    const editor = createEditor("<p>/image</p>");
    const imageCommand = defaultSlashCommandSpecs.find((command) => command.id === "image");

    if (!imageCommand) {
      throw new Error("Expected image slash command.");
    }

    expect(editor.commands.setTextSelection(textPosition(editor, "/image"))).toBe(true);
    expect(executeSlashCommand(editor, getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state)), imageCommand)).toBe(true);
    expect(editor.getText()).not.toContain("/image");
    expect(editor.getJSON().content?.some((node) => node.type === "image" && node.attrs?.src === null)).toBe(true);
  });

  it("inserts an empty video placeholder without an upload result", () => {
    const editor = createEditor("<p>/video</p>");
    const videoCommand = defaultSlashCommandSpecs.find((command) => command.id === "video");

    if (!videoCommand) {
      throw new Error("Expected video slash command.");
    }

    expect(editor.commands.setTextSelection(textPosition(editor, "/video"))).toBe(true);
    expect(executeSlashCommand(editor, getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state)), videoCommand)).toBe(true);
    expect(editor.getText()).not.toContain("/video");
    expect(editor.getJSON().content?.some((node) => node.type === "markweaveVideo" && node.attrs?.src === null)).toBe(true);
  });

  it("keeps input-only slash commands from mutating without a chosen emoji or upload result", () => {
    const editor = createEditor("<p>/emoji</p><p>/attachment</p>");
    const emojiCommand = defaultSlashCommandSpecs.find((command) => command.id === "emoji");
    const attachmentCommand = defaultSlashCommandSpecs.find((command) => command.id === "attachment");

    if (!emojiCommand || !attachmentCommand) {
      throw new Error("Expected input-only slash commands.");
    }

    expect(editor.commands.setTextSelection(textPosition(editor, "/emoji"))).toBe(true);
    expect(executeSlashCommand(editor, getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state)), emojiCommand)).toBe(false);
    expect(editor.getText()).toContain("/emoji");

    expect(editor.commands.setTextSelection(textPosition(editor, "/attachment"))).toBe(true);
    expect(executeSlashCommand(editor, getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state)), attachmentCommand)).toBe(false);
    expect(editor.getText()).toContain("/attachment");
  });

  it("keeps external AI slash commands outside the default executable slash menu", () => {
    const editor = createEditor("<p>/grammar</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/grammar"))).toBe(true);
    const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
    const grammarCommand = externalAiSlashCommandSpecs.find((command) => command.id === "fix-grammar");

    if (!grammarCommand) {
      throw new Error("Expected external Fix Grammar slash command.");
    }

    expect(defaultSlashCommandSpecs.map((command) => command.id)).not.toContain("fix-grammar");
    expect(filterSlashCommands("grammar").map((command) => command.id)).toEqual([]);
    expect(grammarCommand).toMatchObject({
      label: "Fix Grammar",
      category: "ai",
      executionKind: "external-ai",
    });
    expect(isExecutableSlashCommand(grammarCommand)).toBe(false);
    expect(getSlashCommandKeyboardAction({ ...state, activeIndex: 0 }, [grammarCommand], "Enter")).toEqual({ type: "ignore" });
    expect(executeSlashCommand(editor, state, grammarCommand)).toBe(false);
    expect(editor.getText()).toContain("/grammar");
    expect(tableShape(editor)).toEqual([]);
  });

  it("models slash keyboard intent for Escape, arrows, Enter, and Tab", () => {
    const editor = createEditor("<p>/table</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/table"))).toBe(true);
    const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
    const commands = defaultSlashCommandSpecs;
    const tableIndex = commands.findIndex((command) => command.id === "table");

    expect(isSlashCommandMenuState(state)).toBe(true);
    expect(getSlashCommandKeyboardAction(initialSlashCommandState, commands, "ArrowDown")).toEqual({ type: "ignore" });
    expect(getSlashCommandKeyboardAction(state, [], "Enter")).toEqual({ type: "ignore" });
    expect(getSlashCommandKeyboardAction(state, commands, "Escape")).toEqual({ type: "close" });
    expect(getSlashCommandKeyboardAction(state, commands, "ArrowDown")).toEqual({
      type: "move-active",
      delta: 1,
      optionCount: commands.length,
    });
    expect(getSlashCommandKeyboardAction(state, commands, "ArrowUp")).toEqual({
      type: "move-active",
      delta: -1,
      optionCount: commands.length,
    });

    const tableActiveState = {
      ...state,
      activeIndex: tableIndex,
    };

    expect(getSlashCommandKeyboardAction(tableActiveState, commands, "Enter")).toMatchObject({
      type: "execute-active",
      command: { id: "table" },
    });
    expect(getSlashCommandKeyboardAction(tableActiveState, commands, "Tab")).toMatchObject({
      type: "execute-active",
      command: { id: "table" },
    });
  });

  it("ignores slash keyboard shortcuts while IME composition is active", () => {
    const editor = createEditor("<p>/table</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/table"))).toBe(true);
    const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
    const commands = defaultSlashCommandSpecs;
    const tableActiveState = {
      ...state,
      activeIndex: commands.findIndex((command) => command.id === "table"),
    };

    expect(getSlashCommandKeyboardAction(tableActiveState, commands, "Enter", { isComposing: true })).toEqual({ type: "ignore" });
    expect(getSlashCommandKeyboardAction(tableActiveState, commands, "Tab", { isComposing: true })).toEqual({ type: "ignore" });
    expect(getSlashCommandKeyboardAction(tableActiveState, commands, "Escape", { isComposing: true })).toEqual({ type: "ignore" });
    expect(getSlashCommandKeyboardAction(tableActiveState, commands, "ArrowDown", { isComposing: true })).toEqual({ type: "ignore" });
  });

  it("can reopen a valid slash query after composition ends", () => {
    const editor = createEditor("<p>/table</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/table"))).toBe(true);
    const openState = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
    const closedByComposition = reduceSlashCommandState(openState, { type: "composition-start" });

    expect(closedByComposition.name).toBe("closed");
    expect(dispatchCompositionEvent(editor, "compositionstart")).toBe(true);
    expect(getSlashCommandContext(editor.state)).toBeNull();
    expect(dispatchCompositionEvent(editor, "compositionend")).toBe(true);

    const reopened = getNextSlashCommandState(closedByComposition, getSlashCommandContext(editor.state));
    expect(reopened).toMatchObject({
      name: "filtering",
      query: "table",
      triggerFrom: textPosition(editor, "/table", "start"),
      triggerTo: textPosition(editor, "/table"),
    });
  });

  it("keeps no-result slash state visible without executing commands", () => {
    const editor = createEditor("<p>/zzzz</p>");
    expect(editor.commands.setTextSelection(textPosition(editor, "/zzzz"))).toBe(true);
    const state = getNextSlashCommandState(initialSlashCommandState, getSlashCommandContext(editor.state));
    const commands = filterSlashCommands("zzzz");
    const position = { left: 24, top: 40, triggerLeft: 24, triggerTop: 8, maxHeight: 320, placement: "bottom" as const };

    expect(commands).toEqual([]);
    expect(getSlashCommandKeyboardAction(state, commands, "Enter")).toEqual({ type: "ignore" });
    expect(getSlashCommandKeyboardAction(state, commands, "Tab")).toEqual({ type: "ignore" });
    expect(getSlashCommandMenuPresentation(state, commands, position)).toEqual({
      visible: true,
      empty: true,
      activeIndex: -1,
    });
    expect(getSlashCommandMenuPresentation(state, commands, null)).toEqual({
      visible: false,
      empty: false,
      activeIndex: -1,
    });
    expect(getSlashCommandMenuPresentation(initialSlashCommandState, commands, position)).toEqual({
      visible: false,
      empty: false,
      activeIndex: -1,
    });
  });

  it("clamps stale slash active indexes to the visible command list", () => {
    const state = {
      ...initialSlashCommandState,
      name: "keyboard-selecting" as const,
      activeIndex: 999,
      triggerFrom: 1,
      triggerTo: 4,
    };
    const commands = filterSlashCommands("list");

    expect(commands.length).toBeGreaterThan(0);
    expect(
      getSlashCommandMenuPresentation(state, commands, { left: 0, top: 0, triggerLeft: 0, triggerTop: 0, maxHeight: 320, placement: "bottom" }),
    ).toMatchObject({
      visible: true,
      empty: false,
      activeIndex: commands.length - 1,
    });
  });

  it("wraps slash keyboard selection through the reducer", () => {
    const state = {
      ...initialSlashCommandState,
      name: "keyboard-selecting" as const,
      activeIndex: 0,
      triggerFrom: 1,
      triggerTo: 2,
    };

    expect(reduceSlashCommandState(state, { type: "move-active", delta: -1, optionCount: 3 }).activeIndex).toBe(2);
    expect(reduceSlashCommandState({ ...state, activeIndex: 2 }, { type: "move-active", delta: 1, optionCount: 3 }).activeIndex).toBe(0);
  });

  it("lets slash menu hover set the active command used by Enter and Tab", () => {
    const state = {
      ...initialSlashCommandState,
      name: "filtering" as const,
      query: "",
      triggerFrom: 1,
      triggerTo: 2,
    };
    const commands = defaultSlashCommandSpecs;
    const blockquoteIndex = commands.findIndex((command) => command.id === "blockquote");

    expect(blockquoteIndex).toBeGreaterThanOrEqual(0);
    const hovered = reduceSlashCommandState(state, {
      type: "set-active",
      index: blockquoteIndex,
      optionCount: commands.length,
    });

    expect(hovered.activeIndex).toBe(blockquoteIndex);
    expect(getSlashCommandKeyboardAction(hovered, commands, "Enter")).toMatchObject({
      type: "execute-active",
      command: { id: "blockquote" },
    });
    expect(getSlashCommandKeyboardAction(hovered, commands, "Tab")).toMatchObject({
      type: "execute-active",
      command: { id: "blockquote" },
    });
    expect(reduceSlashCommandState(state, { type: "set-active", index: 999, optionCount: 3 }).activeIndex).toBe(2);
  });
});
