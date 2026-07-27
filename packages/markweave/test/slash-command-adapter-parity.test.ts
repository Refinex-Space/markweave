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
  });
});
