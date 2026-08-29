import { describe, expect, it, vi } from "vitest";
import {
  createMarkweaveCommandRegistry,
  markweaveBuiltinCommandIds,
} from "../src/commands/command-registry";
import type { MarkweaveCommandContext, MarkweaveCommandSpec } from "../src/commands/command-types";

const context: MarkweaveCommandContext = {
  editorId: "test-editor",
  editable: true,
  mode: "live",
  format: "markdown",
  selection: { empty: true, from: 1, to: 1, text: "" },
  activeBlock: { type: "paragraph", depth: 1, text: "" },
};

function hostCommand(overrides: Partial<MarkweaveCommandSpec> = {}): MarkweaveCommandSpec {
  return {
    id: "trm.decision.insert-field",
    label: "插入字段",
    groupId: "trm.decision",
    icon: { kind: "text", text: "字段" },
    execute: () => ({ kind: "apply", content: { format: "text", value: "字段" } }),
    ...overrides,
  };
}

describe("Markweave command registry", () => {
  it("exposes the stable 22-command builtin inventory", () => {
    const registry = createMarkweaveCommandRegistry({ lang: "zh" });
    expect(registry.commands.map((command) => command.id)).toEqual(markweaveBuiltinCommandIds);
    expect(registry.commands).toHaveLength(22);
    expect(Object.isFrozen(registry.commands)).toBe(true);
  });

  it("merges host groups and commands by stable order", () => {
    const registry = createMarkweaveCommandRegistry({
      commandGroups: [{ id: "trm.decision", label: "决策字段", order: 250 }],
      commands: [hostCommand({ order: 10 })],
    });
    const commands = registry.resolve(context, { surface: "slash" });
    expect(commands.find((command) => command.id === "trm.decision.insert-field")).toMatchObject({
      groupId: "trm.decision",
      groupLabel: "决策字段",
      enabled: true,
    });
    expect(commands.findIndex((command) => command.id === "trm.decision.insert-field"))
      .toBeLessThan(commands.findIndex((command) => command.id === "emoji"));
  });

  it("normalizes valid text icons and keeps surface defaults immutable", () => {
    const registry = createMarkweaveCommandRegistry({
      commandGroups: [{ id: "trm.decision", label: "决策字段" }],
      commands: [hostCommand({ icon: { kind: "text", text: " 字段 " } })],
    });
    const command = registry.commands.find((item) => item.id === "trm.decision.insert-field");
    expect(command).toMatchObject({ icon: { kind: "text", text: "字段" }, surfaces: ["slash", "api"] });
    expect(Object.isFrozen(command?.surfaces)).toBe(true);
  });

  it("filters builtins with mutually exclusive include/exclude semantics", () => {
    expect(createMarkweaveCommandRegistry({ builtinCommands: { include: ["paragraph", "table"] } }).commands.map((command) => command.id))
      .toEqual(["paragraph", "table"]);
    expect(createMarkweaveCommandRegistry({ builtinCommands: { exclude: ["paragraph"] } }).commands.some((command) => command.id === "paragraph"))
      .toBe(false);
    expect(createMarkweaveCommandRegistry({ builtinCommands: { include: ["paragraph"], exclude: ["table"] } }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_BUILTIN_CONFIG" })]));
  });

  it("fails closed for invalid namespaces, groups, surfaces, icons, and duplicate builtin ids", () => {
    const registry = createMarkweaveCommandRegistry({
      commandGroups: [
        { id: "Invalid", label: "Invalid" },
        { id: "trm.decision", label: "决策字段" },
      ],
      commands: [
        hostCommand({ id: "paragraph" }),
        hostCommand({ id: "missing.group.command", groupId: "missing.group" }),
        hostCommand({ id: "trm.decision.bad-surface", surfaces: ["toolbar" as "slash"] }),
        hostCommand({ id: "trm.decision.bad-icon", icon: { kind: "text", text: "12345" } }),
      ],
    });
    expect(registry.commands).toHaveLength(22);
    expect(registry.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "INVALID_GROUP",
      "DUPLICATE_COMMAND",
      "UNKNOWN_GROUP",
      "INVALID_COMMAND",
    ]));
  });

  it("evaluates visibility and enabled predicates synchronously and safely", () => {
    const isVisible = vi.fn(() => true);
    const isEnabled = vi.fn(() => false);
    const registry = createMarkweaveCommandRegistry({
      commandGroups: [{ id: "trm.decision", label: "决策字段" }],
      commands: [hostCommand({ isVisible, isEnabled, getDisabledReason: () => "请先选择字段" })],
    });
    expect(registry.resolve(context, { query: "字段", surface: "api" }).find((command) => command.id === "trm.decision.insert-field"))
      .toMatchObject({ enabled: false, disabledReason: "请先选择字段" });
    expect(isVisible).toHaveBeenCalledWith(context);
    expect(isEnabled).toHaveBeenCalledWith(context);

    const hidden = createMarkweaveCommandRegistry({
      commandGroups: [{ id: "trm.decision", label: "决策字段" }],
      commands: [hostCommand({ isVisible: () => { throw new Error("unsafe"); } })],
    });
    expect(hidden.resolve(context).some((command) => command.id === "trm.decision.insert-field")).toBe(false);
  });

  it("throws a single diagnostic in strict mode", () => {
    expect(() => createMarkweaveCommandRegistry({ strict: true, commands: [hostCommand()] })).toThrow("Unknown command group");
  });
});
