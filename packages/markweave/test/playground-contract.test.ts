import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { playgroundCapabilityContract, playgroundDebugTestIds } from "../../../apps/playground-fixtures/src/index";

const workspaceRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const playgroundSources = {
  react: readFileSync(resolve(workspaceRoot, "apps/playground-react/src/MarkweaveEditorPlayground.tsx"), "utf8"),
  vue2: readFileSync(resolve(workspaceRoot, "apps/playground-vue2/src/MarkweaveEditorPlayground.vue"), "utf8"),
  vue3: readFileSync(resolve(workspaceRoot, "apps/playground-vue3/src/MarkweaveEditorPlayground.vue"), "utf8"),
};

const requiredEditorProps = [
  ["autoFocusFirstTableBodyCell", "auto-focus-first-table-body-cell"],
  ["defaultContentFormat", "default-content-format"],
  ["onEditWithAi", "on-edit-with-ai"],
  ["onExtractToNote", "on-extract-to-note"],
  ["onRewriteSelection", "on-rewrite-selection"],
  ["onRuntimeStateChange", "on-runtime-state-change"],
  ["onSlashCommandUpload", "on-slash-command-upload"],
  ["onTableCommandResult", "on-table-command-result"],
  ["onTableCopyPayload", "on-table-copy-payload"],
] as const;

describe("playground integration contract", () => {
  it("keeps the shared playground capability contract explicit", () => {
    expect(playgroundCapabilityContract).toEqual([
      "markdown",
      "live-view-mode",
      "floating-toolbar",
      "slash-command",
      "table",
      "media",
      "codeblock",
      "mermaid",
      "math",
      "toc",
      "upload-callback",
      "ai-callback",
    ]);
  });

  it("uses the same fixtures and upload mock in React, Vue 2, and Vue 3 playgrounds", () => {
    for (const source of Object.values(playgroundSources)) {
      expect(source).toContain("initialPlaygroundDocument");
      expect(source).toContain("mergedTablePlaygroundDocument");
      expect(source).toContain("createPlaygroundUploadResult");
      expect(source).toContain("markweave-playground-mode-toggle");
    }
  });

  it("wires the complete editor callback surface in every playground", () => {
    for (const [framework, source] of Object.entries(playgroundSources)) {
      for (const propAliases of requiredEditorProps) {
        expect(propAliases.some((prop) => source.includes(prop)), `${framework} playground should wire ${propAliases[0]}`).toBe(true);
      }
    }
  });

  it("keeps Vue playgrounds in single-file component form", () => {
    expect(playgroundSources.vue2).toContain("<template>");
    expect(playgroundSources.vue2).toContain("<script>");
    expect(playgroundSources.vue3).toContain("<template>");
    expect(playgroundSources.vue3).toContain('<script setup lang="ts">');
  });

  it("keeps debug surfaces discoverable across all playgrounds", () => {
    for (const [framework, source] of Object.entries(playgroundSources)) {
      for (const testId of playgroundDebugTestIds) {
        expect(source, `${framework} playground should expose ${testId}`).toContain(testId);
      }
    }
  });
});
