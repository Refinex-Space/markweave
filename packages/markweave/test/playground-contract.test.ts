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

const readmeSources = {
  root: readFileSync(resolve(workspaceRoot, "README.md"), "utf8"),
  package: readFileSync(resolve(workspaceRoot, "packages/markweave/README.md"), "utf8"),
};

const runbookSource = readFileSync(resolve(workspaceRoot, "docs/guides/runbook.md"), "utf8");

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

  it("documents framework-native published integration shapes", () => {
    for (const [name, source] of Object.entries(readmeSources)) {
      expect(source, `${name} README should document React TSX usage`).toContain('from "markweave/react"');
      expect(source, `${name} README should document Vue 3 SFC usage`).toContain('<script setup lang="ts">');
      expect(source, `${name} README should document Vue 2 SFC usage`).toContain("Vue CLI 4 / Webpack 4 projects must install `vue-template-compiler`");
      expect(source, `${name} README should document Vue 2 SFC template`).toContain("<template>");
      expect(source, `${name} README should document Vue 2 component registration`).toContain("components: { MarkweaveEditor }");
      expect(source, `${name} README should not use inline Vue 2 root templates`).not.toContain("new Vue({");
      expect(source, `${name} README should document shared stylesheet import`).toContain('import "markweave/styles.css";');
      expect(source, `${name} README should allow app-level stylesheet import`).toContain("You can import `markweave/styles.css` once in the app entry");
    }
  });

  it("documents package dry-run verification before publishing", () => {
    expect(runbookSource).toContain("pnpm --filter markweave pack --dry-run");
    expect(runbookSource).toContain("playground-only files are not included in package `files`");
  });
});
