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

const aiEditGuideSources = {
  reactEn: readFileSync(resolve(workspaceRoot, "docs/guides/react-integration.md"), "utf8"),
  reactZh: readFileSync(resolve(workspaceRoot, "docs/guides/react-integration-zh-cn.md"), "utf8"),
  vue2En: readFileSync(resolve(workspaceRoot, "docs/guides/vue2-integration.md"), "utf8"),
  vue2Zh: readFileSync(resolve(workspaceRoot, "docs/guides/vue2-integration-zh-cn.md"), "utf8"),
  vue3En: readFileSync(resolve(workspaceRoot, "docs/guides/vue3-integration.md"), "utf8"),
  vue3Zh: readFileSync(resolve(workspaceRoot, "docs/guides/vue3-integration-zh-cn.md"), "utf8"),
};

const publishedReadmeSources = {
  core: readFileSync(resolve(workspaceRoot, "packages/markweave/README.md"), "utf8"),
  react: readFileSync(resolve(workspaceRoot, "packages/markweave-react/README.md"), "utf8"),
  vue2: readFileSync(resolve(workspaceRoot, "packages/markweave-vue2/README.md"), "utf8"),
  vue3: readFileSync(resolve(workspaceRoot, "packages/markweave-vue3/README.md"), "utf8"),
};

const runbookSource = readFileSync(resolve(workspaceRoot, "docs/guides/runbook.md"), "utf8");
const envExampleSource = readFileSync(resolve(workspaceRoot, ".env.example"), "utf8");
const playgroundConfigSources = {
  react: readFileSync(resolve(workspaceRoot, "apps/playground-react/vite.config.ts"), "utf8"),
  vue2: readFileSync(resolve(workspaceRoot, "apps/playground-vue2/vue.config.js"), "utf8"),
  vue3: readFileSync(resolve(workspaceRoot, "apps/playground-vue3/vite.config.ts"), "utf8"),
};
const rootPackageJson = JSON.parse(readFileSync(resolve(workspaceRoot, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

const requiredEditorProps = [
  ["autoFocusFirstTableBodyCell", "auto-focus-first-table-body-cell"],
  ["defaultContentFormat", "default-content-format", "contentFormat", "content-format"],
  ["onEditWithAi", "on-edit-with-ai"],
  ["onExtractToNote", "on-extract-to-note"],
  ["onRewriteSelection", "on-rewrite-selection"],
  ["onRuntimeStateChange", "on-runtime-state-change"],
  ["onSlashCommandUpload", "on-slash-command-upload"],
  ["onTableCommandResult", "on-table-command-result"],
  ["onTableCopyPayload", "on-table-copy-payload"],
  ["commandGroups", "command-groups"],
  ["commands", ":commands"],
  ["editorExtensions", "editor-extensions"],
  ["onCommandControllerChange", "on-command-controller-change"],
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
      "host-command-registry",
      "editor-extensions",
    ]);
  });

  it("uses the same fixtures and upload mock in React, Vue 2, and Vue 3 playgrounds", () => {
    for (const source of Object.values(playgroundSources)) {
      expect(source).toContain("initialPlaygroundDocument");
      expect(source).toContain("largeDocumentPerformanceFixture");
      expect(source).toContain("mergedTablePlaygroundDocument");
      expect(source).toContain("createPlaygroundUploadResult");
      expect(source).toContain("markweave-playground-mode-toggle");
      expect(source).toContain("createPlaygroundHostCommands");
      expect(source).toContain("createPlaygroundHostExtension");
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

  it("routes Ask AI through the shared server-side OpenRouter proxy", () => {
    for (const source of Object.values(playgroundSources)) {
      expect(source).toContain("playgroundAskAiConfig");
    }
    for (const source of Object.values(playgroundConfigSources)) {
      expect(source).toContain("createOpenRouterDevMiddleware");
    }
    expect(envExampleSource).toContain("OPENROUTER_API_KEY=replace-with-your-local-key");
    expect(envExampleSource).toContain("OPENROUTER_MODEL=openrouter/free");
    expect(envExampleSource).not.toContain("VITE_OPENROUTER");
    expect(envExampleSource).not.toContain("VUE_APP_OPENROUTER");
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
      expect(source, `${name} README should document React TSX usage`).toContain('from "@markweave/react"');
      expect(source, `${name} README should document Vue 3 SFC usage`).toContain('<script setup lang="ts">');
      expect(source, `${name} README should document Vue 2 SFC usage`).toContain("Vue 2 CLI / Webpack 4 projects should keep `vue-template-compiler`");
      expect(source, `${name} README should document Vue 2 SFC template`).toContain("<template>");
      expect(source, `${name} README should document Vue 2 component registration`).toContain("components: { MarkweaveEditor }");
      expect(source, `${name} README should not use inline Vue 2 root templates`).not.toContain("new Vue({");
      expect(source, `${name} README should document React adapter stylesheet import`).toContain('import "@markweave/react/styles.css";');
      expect(source, `${name} README should document Vue 3 adapter stylesheet import`).toContain('import "@markweave/vue3/styles.css";');
      expect(source, `${name} README should document Vue 2 adapter stylesheet import`).toContain('import "@markweave/vue2/styles.css";');
      expect(source, `${name} README should document shared core stylesheet compatibility`).toContain("markweave/styles.css");
      expect(source, `${name} README should allow app-level stylesheet import`).toContain("You can import the adapter `styles.css` once in the app entry");
    }
  });

  it("keeps the host-driven AI edit protocol unambiguous across framework guides", () => {
    const requiredProtocolTerms = [
      "captureSelection",
      "updateProposal",
      "failProposal",
      "getState",
      "subscribe",
      "onDecision",
      "previousHunk",
      "nextHunk",
      "acceptHunk",
      "discardHunk",
      "acceptAll",
      "discardAll",
      'controls: "none"',
      "active-review",
      "stale-context",
      "incomplete-proposal",
      "AbortSignal",
    ];

    for (const [guide, source] of Object.entries(aiEditGuideSources)) {
      for (const term of requiredProtocolTerms) {
        expect(source, `${guide} should document ${term}`).toContain(term);
      }
      expect(source, `${guide} should require cumulative streaming Markdown`).toMatch(/accumulated Markdown|累计 Markdown|当前累计的完整 Markdown/);
      expect(source, `${guide} should document the controller lifecycle`).toMatch(/controller lifecycle|控制器生命周期/i);
    }
  });

  it("documents AI edit discovery in every published package README", () => {
    for (const [name, source] of Object.entries(publishedReadmeSources)) {
      expect(source, `${name} README should expose MarkweaveAiEditController`).toContain("MarkweaveAiEditController");
    }
    expect(publishedReadmeSources.core).toContain("createMarkweaveAiEditController");
    expect(publishedReadmeSources.react).toContain("onAiEditControllerChange");
    expect(publishedReadmeSources.vue2).toContain(":on-ai-edit-controller-change");
    expect(publishedReadmeSources.vue3).toContain(":on-ai-edit-controller-change");
  });

  it("documents package dry-run verification before publishing", () => {
    expect(rootPackageJson.scripts?.["release:pack"]).toContain("pnpm --filter markweave pack --dry-run");
    expect(rootPackageJson.scripts?.["release:pack"]).toContain("pnpm --filter @markweave/react pack --dry-run");
    expect(rootPackageJson.scripts?.["release:pack"]).toContain("pnpm release:verify");
    expect(rootPackageJson.scripts?.["release:dry-run"]).toContain("pnpm release:verify");
    expect(rootPackageJson.scripts?.["release:verify"]).toContain("pnpm release:verify-artifacts");
    expect(rootPackageJson.scripts?.["release:verify"]).toContain("pnpm verify:vue2-packed");
    expect(rootPackageJson.scripts?.["release:verify-artifacts"]).toBe("node scripts/verify-publish-artifacts.mjs");
    expect(rootPackageJson.scripts?.["release:dry-run"]).toContain("pnpm --filter markweave publish --dry-run --no-git-checks");
    expect(rootPackageJson.scripts?.["release:dry-run"]).toContain("pnpm --filter @markweave/react publish --dry-run --access public --no-git-checks");
    expect(runbookSource).toContain("pnpm --filter markweave pack --dry-run");
    expect(runbookSource).toContain("pnpm --filter @markweave/react pack --dry-run");
    expect(runbookSource).toContain("pnpm --filter @markweave/vue2 pack --dry-run");
    expect(runbookSource).toContain("pnpm --filter @markweave/vue3 pack --dry-run");
    expect(runbookSource).toContain("pnpm release:pack");
    expect(runbookSource).toContain("pnpm release:dry-run");
    expect(runbookSource).toContain("publishConfig.access");
    expect(runbookSource).toContain("playground-only files are not included in package `files`");
  });
});
