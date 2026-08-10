// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMarkweaveCommandController,
  executeMarkweaveSlashCommand,
  markweaveCommandResultMaxBytes,
  setMarkweaveCommandRegistry,
} from "../src/commands/command-runtime";
import { createMarkweaveCommandRegistry } from "../src/commands/command-registry";
import type { MarkweaveCommandHandler, MarkweaveCommandResult, MarkweaveCommandSpec } from "../src/commands/command-types";
import { createMarkweaveEditorExtensions } from "../src/editor-core/create-editor-extensions";
import { setMarkweaveEditorModeState } from "../src/core/editor-mode-state";
import { getSlashCommandContext } from "../src/plugins/slash-command/slash-runtime";

let activeEditor: Editor | null = null;

function createEditor(content = "<p>hello world</p>") {
  const element = document.createElement("div");
  document.body.appendChild(element);
  activeEditor = new Editor({ element, extensions: createMarkweaveEditorExtensions(), content });
  return activeEditor;
}

function installHostCommand(editor: Editor, execute: MarkweaveCommandHandler, overrides: Partial<MarkweaveCommandSpec> = {}) {
  const command: MarkweaveCommandSpec = {
    id: "host.test.insert",
    label: "Insert",
    groupId: "host.test",
    execute,
    ...overrides,
  };
  const registry = createMarkweaveCommandRegistry({
    commandGroups: [{ id: "host.test", label: "Host" }],
    commands: [command],
  });
  setMarkweaveCommandRegistry(editor, registry);
  return createMarkweaveCommandController(editor);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

afterEach(() => {
  activeEditor?.destroy();
  activeEditor = null;
  document.body.innerHTML = "";
});

describe("Markweave command controller runtime", () => {
  it("applies text at the captured cursor and keeps one undo step", async () => {
    const editor = createEditor();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)));
    const controller = installHostCommand(editor, () => ({ kind: "apply", content: { format: "text", value: "!" } }));
    const before = editor.getText();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const result = await controller.execute("host.test.insert");
    expect(result).toMatchObject({ ok: true, outcome: "applied" });
    expect(editor.getText()).toBe("hello! world");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe(before);
  });

  it("applies valid Markdown and JSON results with API placement fallback", async () => {
    const editor = createEditor("<p>start</p>");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    let controller = installHostCommand(editor, () => ({
      kind: "apply",
      content: { format: "markdown", value: "**bold**" },
      placement: "replace-trigger",
    }));
    const markdownDispatch = vi.spyOn(editor.view, "dispatch");
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: true, outcome: "applied" });
    expect(editor.getHTML()).toContain("<strong>bold</strong>");
    expect(markdownDispatch).toHaveBeenCalledTimes(1);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.head).toBeGreaterThan(1);

    controller = installHostCommand(editor, () => ({
      kind: "apply",
      content: { format: "json", value: { type: "paragraph", content: [{ type: "text", text: "json" }] } },
    }));
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: true, outcome: "applied" });
    expect(editor.getText()).toContain("json");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).not.toContain("json");
  });

  it("applies a builtin Slash command in one dispatch and one undo step", async () => {
    const editor = createEditor("<p>/table</p>");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const context = getSlashCommandContext(editor.state);
    if (!context) throw new Error("Expected a Slash context.");
    const dispatch = vi.spyOn(editor.view, "dispatch");

    await expect(executeMarkweaveSlashCommand(editor, "table", context)).resolves.toMatchObject({ ok: true, outcome: "applied" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.getJSON().content?.some((node) => node.type === "table")).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("/table");
  });

  it("replaces the complete Slash trigger for a host command in one undo step", async () => {
    const editor = createEditor("<p>/host</p>");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const context = getSlashCommandContext(editor.state);
    if (!context) throw new Error("Expected a Slash context.");
    installHostCommand(editor, () => ({ kind: "apply", content: { format: "text", value: "done" } }));
    const dispatch = vi.spyOn(editor.view, "dispatch");

    await expect(executeMarkweaveSlashCommand(editor, "host.test.insert", context)).resolves.toMatchObject({ ok: true, outcome: "applied" });
    expect(editor.getText()).toBe("done");
    expect(editor.state.selection.head).toBe(5);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("/host");
  });

  it("preserves a captured selection for cursor insertion and falls back after replacement", async () => {
    const editor = createEditor();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)));
    let controller = installHostCommand(editor, () => ({
      kind: "apply",
      content: { format: "text", value: "!" },
      selection: "preserve",
    }));
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: true, outcome: "applied" });
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(7);
    expect(editor.getText()).toBe("hello! world");
    expect(editor.commands.undo()).toBe(true);

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)));
    controller = installHostCommand(editor, () => ({
      kind: "apply",
      content: { format: "text", value: "Hi" },
      placement: "replace-selection",
      selection: "preserve",
    }));
    const dispatch = vi.spyOn(editor.view, "dispatch");
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: true, outcome: "applied" });
    expect(editor.getText()).toBe("Hi world");
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.head).toBe(3);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("hello world");
  });

  it("returns structured cancellation and handler failures without changing history", async () => {
    const editor = createEditor();
    const before = editor.getJSON();
    let controller = installHostCommand(editor, () => ({ kind: "cancel" }));
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: true, outcome: "cancelled" });
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().undo()).toBe(false);

    controller = installHostCommand(editor, () => { throw new Error("secret backend detail"); });
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: false, code: "HANDLER_FAILED", message: "The command handler failed." });
    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().undo()).toBe(false);
  });

  it("returns stable not-found, disabled, and unavailable errors", async () => {
    const editor = createEditor();
    let controller = installHostCommand(editor, () => ({ kind: "cancel" }), { isEnabled: () => false, getDisabledReason: () => "Unavailable now" });
    await expect(controller.execute("missing.command")).resolves.toMatchObject({ ok: false, code: "COMMAND_NOT_FOUND" });
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: false, code: "COMMAND_DISABLED", message: "Unavailable now" });

    editor.destroy();
    activeEditor = null;
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: false, code: "EDITOR_UNAVAILABLE" });
    expect(controller.getCommands()).toEqual([]);
  });

  it("rejects concurrent execution and supports explicit abort", async () => {
    const editor = createEditor();
    const handler: MarkweaveCommandHandler = ({ signal }) => new Promise<MarkweaveCommandResult>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const controller = installHostCommand(editor, handler);
    const first = controller.execute("host.test.insert");
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: false, code: "COMMAND_BUSY" });
    controller.cancel();
    await expect(first).resolves.toMatchObject({ ok: false, code: "COMMAND_ABORTED" });
    expect(editor.getText()).toBe("hello world");
  });

  it("settles cancellation immediately when a handler ignores AbortSignal and discards its late result", async () => {
    const editor = createEditor();
    const pending = deferred<MarkweaveCommandResult>();
    const controller = installHostCommand(editor, () => pending.promise);
    const running = controller.execute("host.test.insert");
    controller.cancel();
    await expect(running).resolves.toMatchObject({ ok: false, code: "COMMAND_ABORTED" });
    expect(controller.getState().phase).toBe("idle");

    pending.resolve({ kind: "apply", content: { format: "text", value: "late" } });
    await Promise.resolve();
    expect(editor.getText()).toBe("hello world");
  });

  it("maps edits outside the captured selection and conflicts on target edits", async () => {
    const editor = createEditor();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)));
    let pending = deferred<{ kind: "apply"; content: { format: "text"; value: string }; placement: "replace-selection" }>();
    let controller = installHostCommand(editor, () => pending.promise);
    const outside = controller.execute("host.test.insert");
    editor.view.dispatch(editor.state.tr.insertText("X", editor.state.doc.content.size - 1));
    pending.resolve({ kind: "apply", content: { format: "text", value: "Hi" }, placement: "replace-selection" });
    await expect(outside).resolves.toMatchObject({ ok: true, outcome: "applied" });
    expect(editor.getText()).toBe("Hi worldX");

    editor.commands.setContent("<p>hello world</p>", { emitUpdate: false });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)));
    pending = deferred();
    controller = installHostCommand(editor, () => pending.promise);
    const conflict = controller.execute("host.test.insert");
    editor.view.dispatch(editor.state.tr.insertText("changed", 1, 6));
    pending.resolve({ kind: "apply", content: { format: "text", value: "Hi" }, placement: "replace-selection" });
    await expect(conflict).resolves.toMatchObject({ ok: false, code: "COMMAND_CONFLICT" });
    expect(editor.getText()).toBe("changed world");
  });

  it("enforces the 1 MiB result boundary and rejects malformed JSON", async () => {
    const editor = createEditor();
    let controller = installHostCommand(editor, () => ({
      kind: "apply",
      content: { format: "text", value: "x".repeat(markweaveCommandResultMaxBytes + 1) },
    }));
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: false, code: "INVALID_RESULT" });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    controller = installHostCommand(editor, () => ({ kind: "apply", content: { format: "json", value: circular as never } }));
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: false, code: "INVALID_RESULT" });
    expect(editor.getText()).toBe("hello world");
  });

  it("accepts exactly 1 MiB and rejects HTML, empty, and unknown results", async () => {
    const editor = createEditor("<p></p>");
    let controller = installHostCommand(editor, () => ({
      kind: "apply",
      content: { format: "text", value: "x".repeat(markweaveCommandResultMaxBytes) },
    }));
    await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: true, outcome: "applied" });
    expect(editor.getText()).toHaveLength(markweaveCommandResultMaxBytes);
    editor.commands.undo();

    for (const result of [
      { kind: "apply", content: { format: "html", value: "<b>x</b>" } },
      { kind: "apply", content: { format: "text", value: "" } },
      { kind: "unknown" },
      null,
    ]) {
      controller = installHostCommand(editor, () => result as never);
      await expect(controller.execute("host.test.insert")).resolves.toMatchObject({ ok: false, code: "INVALID_RESULT" });
    }
  });

  it("aborts on View mode and isolates throwing host observers", async () => {
    const editor = createEditor();
    const handler: MarkweaveCommandHandler = ({ signal }) => new Promise<MarkweaveCommandResult>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const controller = installHostCommand(editor, handler);
    controller.subscribe(() => { throw new Error("observer failed"); });
    const running = controller.execute("host.test.insert");
    setMarkweaveEditorModeState(editor, { mode: "view", editable: false });
    await expect(running).resolves.toMatchObject({ ok: false, code: "COMMAND_ABORTED" });
    expect(editor.getText()).toBe("hello world");
  });

  it("cancels an active handler when the registry changes and exposes one stable controller", async () => {
    const editor = createEditor();
    const handler = vi.fn(({ signal }) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const controller = installHostCommand(editor, handler);
    expect(createMarkweaveCommandController(editor)).toBe(controller);
    const running = controller.execute("host.test.insert");
    setMarkweaveCommandRegistry(editor, createMarkweaveCommandRegistry());
    await expect(running).resolves.toMatchObject({ ok: false, code: "COMMAND_ABORTED" });
    expect(controller.getCommands({ surface: "api" }).some((command) => command.id === "host.test.insert")).toBe(false);
  });
});
