// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { executeMarkweaveBuiltinCommand } from "../src/commands/builtin-command-runtime";
import {
  MARKWEAVE_DETAILS_NAME,
  MARKWEAVE_DETAILS_SUMMARY_NAME,
  isMarkweaveDetailsOpen,
  toggleMarkweaveDetailsOpen,
} from "../src/plugins/details/details-node";
import { getSlashCommandContext, getSlashCommandOpenDecision } from "../src/plugins/slash-command/slash-runtime";
import { detailsBlockLifecycle } from "../src/plugins/details/behavior-contract";

let activeEditor: Editor | null = null;

function createEditor(content = "<p></p>", contentType: "html" | "markdown" = "html") {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({
    element,
    extensions: createMarkweaveEditorExtensions({ lang: "zh" }),
    content,
    contentType,
  });
  return activeEditor;
}

function dispatchKey(editor: Editor, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  let handled = false;
  editor.view.someProp("handleKeyDown", (handler) => {
    const didHandle = handler(editor.view, event) === true;
    handled = handled || didHandle;
    return didHandle;
  });
  return handled;
}

function detailsNode(editor: Editor) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === MARKWEAVE_DETAILS_NAME) {
      pos = nodePos;
      return false;
    }
    return true;
  });
  if (pos === null) {
    throw new Error("Expected a details block.");
  }
  const node = editor.state.doc.nodeAt(pos);
  if (!node) {
    throw new Error("Expected a details block node.");
  }
  return { pos, node };
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.replaceChildren();
});

describe("details block", () => {
  it("keeps the behavior contract explicit", () => {
    expect(detailsBlockLifecycle).toContain("slash-insert-open-details-with-empty-summary");
    expect(detailsBlockLifecycle).toContain("markdown-details-nested-callout-roundtrip");
  });

  it("inserts an open details block from the slash command and focuses the summary", () => {
    const editor = createEditor("<p>/details</p>");
    expect(executeMarkweaveBuiltinCommand(editor, "details", { from: 1, to: editor.state.doc.content.size - 1 })).toBe(true);

    const details = detailsNode(editor);
    expect(isMarkweaveDetailsOpen(details.node.attrs.open)).toBe(true);
    expect(details.node.firstChild?.type.name).toBe(MARKWEAVE_DETAILS_SUMMARY_NAME);
    expect(details.node.firstChild?.content.size).toBe(0);
    expect(editor.state.selection.$from.parent.type.name).toBe(MARKWEAVE_DETAILS_SUMMARY_NAME);
    const summary = editor.view.dom.querySelector(".markweave-details-summary");
    expect(summary?.classList.contains("is-empty")).toBe(false);
    expect(summary?.getAttribute("data-placeholder")).toBeNull();
    expect(summary?.textContent).toBe("");
  });

  it("round-trips :::details fences, open state, titles, and nested callouts", () => {
    const source = [
      ":::details{open} **Hello**",
      "",
      "Body paragraph",
      "",
      ":::info",
      "",
      "Nested note",
      "",
      ":::",
      "",
      ":::",
    ].join("\n");
    const editor = createEditor(source, "markdown");
    const details = detailsNode(editor);

    expect(isMarkweaveDetailsOpen(details.node.attrs.open)).toBe(true);
    expect(details.node.firstChild?.textContent).toBe("Hello");
    expect(editor.getJSON()).toEqual(expect.objectContaining({
      content: expect.arrayContaining([
        expect.objectContaining({
          type: MARKWEAVE_DETAILS_NAME,
          content: expect.arrayContaining([
            expect.objectContaining({ type: "markweaveCallout" }),
          ]),
        }),
      ]),
    }));

    const markdown = editor.getMarkdown();
    expect(markdown).toContain(":::details{open} **Hello**");
    expect(markdown).toContain(":::info");
    expect(markdown).toContain(":::");

    editor.commands.setContent(markdown, { contentType: "markdown" });
    expect(detailsNode(editor).node.firstChild?.textContent).toBe("Hello");
    expect(isMarkweaveDetailsOpen(detailsNode(editor).node.attrs.open)).toBe(true);
  });

  it("parses native HTML details and preserves the open attribute", () => {
    const editor = createEditor("<details open><summary>Title</summary><p>Body</p></details>");
    const details = detailsNode(editor);
    expect(isMarkweaveDetailsOpen(details.node.attrs.open)).toBe(true);
    expect(details.node.firstChild?.textContent).toBe("Title");
    expect(details.node.textContent).toContain("Body");
    expect(editor.getHTML()).toContain('data-markweave-details="true"');
    expect(editor.getHTML()).toContain('data-open="true"');
  });

  it("persists toggle in Live mode and keeps View-mode toggle visual-only", () => {
    const editor = createEditor(":::details Title\nHidden\n:::", "markdown");
    const details = detailsNode(editor);
    expect(isMarkweaveDetailsOpen(details.node.attrs.open)).toBe(false);

    const toggle = editor.view.dom.querySelector<HTMLButtonElement>("[data-testid='markweave-details-toggle']");
    expect(toggle).not.toBeNull();
    toggle?.click();
    expect(isMarkweaveDetailsOpen(detailsNode(editor).node.attrs.open)).toBe(true);
    expect(editor.getMarkdown()).toContain(":::details{open}");

    editor.setEditable(false);
    const before = editor.getMarkdown();
    toggle?.click();
    expect(editor.getMarkdown()).toBe(before);
    expect(editor.view.dom.querySelector(".markweave-details")?.getAttribute("data-open")).toBe("false");
  });

  it("enters the body from the summary, exits on empty last paragraph, and unwraps from the title", () => {
    const editor = createEditor("<p></p>");
    expect(executeMarkweaveBuiltinCommand(editor, "details", { from: 1, to: 1 })).toBe(true);
    const details = detailsNode(editor);
    editor.commands.setTextSelection(details.pos + 2);

    expect(dispatchKey(editor, "Enter")).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(isMarkweaveDetailsOpen(detailsNode(editor).node.attrs.open)).toBe(true);

    editor.view.dispatch(editor.state.tr.insertText("Inside"));
    expect(editor.state.selection.$from.parent.textContent).toBe("Inside");
    expect(dispatchKey(editor, "Enter")).toBe(true);
    expect(editor.state.selection.$from.parent.textContent).toBe("");
    expect(editor.state.selection.$from.node(-1).type.name).toBe(MARKWEAVE_DETAILS_NAME);
    expect(dispatchKey(editor, "Enter")).toBe(true);
    expect(editor.state.selection.$from.node(-1).type.name).toBe("doc");
    expect(editor.state.selection.$from.node(-1).type.name).toBe("doc");

    editor.commands.setTextSelection(detailsNode(editor).pos + 2);
    expect(dispatchKey(editor, "Backspace")).toBe(true);
    expect(JSON.stringify(editor.getJSON())).not.toContain(MARKWEAVE_DETAILS_NAME);
  });

  it("moves from the first body paragraph back to the summary and redirects hidden selections", () => {
    const editor = createEditor(":::details{open} Title\nBody\n:::", "markdown");
    const details = detailsNode(editor);
    const bodyPos = details.pos + 1 + details.node.firstChild!.nodeSize + 1;
    editor.commands.setTextSelection(bodyPos);
    expect(editor.state.selection.$from.parent.textContent).toBe("Body");

    editor.commands.setTextSelection(bodyPos);
    expect(dispatchKey(editor, "Backspace")).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe(MARKWEAVE_DETAILS_SUMMARY_NAME);

    expect(toggleMarkweaveDetailsOpen(editor, details.pos)).toBe(true);
    expect(isMarkweaveDetailsOpen(detailsNode(editor).node.attrs.open)).toBe(false);
    editor.commands.setTextSelection(bodyPos);
    expect(editor.state.selection.$from.parent.type.name).toBe(MARKWEAVE_DETAILS_SUMMARY_NAME);
  });

  it("opens slash inside the details body and not in the summary", () => {
    const editor = createEditor(`
<div data-markweave-details="true" data-open="true">
  <div data-markweave-details-summary="true">/title</div>
  <p>/body</p>
</div>
`);
    let summaryPos = 0;
    let bodyPos = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "/title") summaryPos = pos + node.nodeSize;
      if (node.isText && node.text === "/body") bodyPos = pos + node.nodeSize;
    });

    editor.commands.setTextSelection(summaryPos);
    expect(getSlashCommandOpenDecision(editor.state)).toMatchObject({
      canOpen: false,
      scope: "details-summary",
    });
    expect(getSlashCommandContext(editor.state)).toBeNull();

    editor.commands.setTextSelection(bodyPos);
    expect(getSlashCommandOpenDecision(editor.state)).toMatchObject({
      canOpen: true,
      scope: "details",
    });
    expect(getSlashCommandContext(editor.state)?.query).toBe("body");
  });
});
