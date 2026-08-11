import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readWorkspaceFile = (path: string) => readFileSync(resolve(workspaceRoot, path), "utf8");

describe("table capability adapter parity", () => {
  const adapters = [
    ["React", "packages/markweave-react/src/MarkweaveEditor.tsx"],
    ["Vue 2", "packages/markweave-vue2/src/MarkweaveEditor.ts"],
    ["Vue 3", "packages/markweave-vue3/src/MarkweaveEditor.ts"],
  ] as const;

  it.each(adapters)("exposes the %s table capability resolver prop", (_name, path) => {
    const source = readWorkspaceFile(path);
    expect(source).toContain("tableCapabilities?: MarkweaveTableCapabilityResolver");
    expect(source).toContain("tableCapabilities:");
  });

  it.each([
    "packages/markweave-react/src/create-editor-extensions.ts",
    "packages/markweave-vue2/src/create-editor-extensions.ts",
    "packages/markweave-vue3/src/create-editor-extensions.ts",
  ])("passes table capabilities through %s", (path) => {
    const source = readWorkspaceFile(path);
    expect(source).toContain("tableCapabilities?: MarkweaveTableCapabilityResolver");
    expect(source).toContain("tableCapabilities: options.tableCapabilities");
  });

  it.each([
    "packages/markweave-react/src/index.ts",
    "packages/markweave-vue2/src/index.ts",
    "packages/markweave-vue3/src/index.ts",
  ])("re-exports public table capability types from %s", (path) => {
    const source = readWorkspaceFile(path);
    expect(source).toContain("MarkweaveTableCapabilityResolver");
    expect(source).toContain("MarkweaveTableCapabilityContext");
  });
});
