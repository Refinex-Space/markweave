import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readWorkspaceFile = (path: string) => readFileSync(resolve(workspaceRoot, path), "utf8");

describe("slash command adapter positioning parity", () => {
  const adapters = [
    ["React", "packages/markweave-react/src/MarkweaveEditor.tsx"],
    ["Vue 2", "packages/markweave-vue2/src/MarkweaveEditor.ts"],
    ["Vue 3", "packages/markweave-vue3/src/MarkweaveEditor.ts"],
  ] as const;

  it.each(adapters)("keeps %s slash overlays anchored during viewport changes", (_name, path) => {
    const source = readWorkspaceFile(path);

    expect(source).toContain("areSlashCommandMenuPositionsEquivalent");
    expect(source).toContain("isSlashCommandAnchorVisible");
    expect(source).toContain("createMarkweaveFrameScheduler");
    expect(source).toContain('window.addEventListener("resize", scheduleSlashMenuPositionUpdate)');
    expect(source).toContain('window.addEventListener("scroll", scheduleSlashMenuPositionUpdate, true)');
    expect(source).toContain('window.removeEventListener("resize", scheduleSlashMenuPositionUpdate)');
    expect(source).toContain('window.removeEventListener("scroll", scheduleSlashMenuPositionUpdate, true)');
    expect(source).toContain("isMarkweaveSlashMenuScrollTarget");
  });

  it.each([
    ["React", "packages/markweave-react/src/ui/slash-command/SlashCommandMenu.tsx"],
    ["Vue 2", "packages/markweave-vue2/src/MarkweaveEditor.ts"],
    ["Vue 3", "packages/markweave-vue3/src/MarkweaveEditor.ts"],
  ] as const)("keeps %s slash keyboard selection scrolled into view", (_name, path) => {
    const source = readWorkspaceFile(path);

    expect(source).toContain("scrollSlashCommandItemIntoView");
    expect(source).toContain("keyboard-selecting");
  });

  it.each([
    ["React", "packages/markweave-react/src/ui/slash-command/SlashCommandMenu.tsx"],
    ["Vue 2", "packages/markweave-vue2/src/MarkweaveEditor.ts"],
    ["Vue 3", "packages/markweave-vue3/src/MarkweaveEditor.ts"],
  ] as const)("sizes %s host text icons with shared Unicode length metadata", (_name, path) => {
    const source = readWorkspaceFile(path);

    expect(source).toContain("getSlashCommandTextIconLength");
    expect(source).toContain("data-text-icon-length");
    expect(source).toContain("data-icon-length");
  });

  it("allocates a non-overlapping grid rail for every supported text-icon length", () => {
    const source = readWorkspaceFile("packages/markweave/src/editor-core/markweave-editor.css");

    expect(source).toContain('button[data-text-icon-length="2"]');
    expect(source).toContain('button[data-text-icon-length="3"]');
    expect(source).toContain('button[data-text-icon-length="4"]');
    expect(source).toContain('.markweave-slash-command-text-icon[data-icon-length="4"]');
  });
});
