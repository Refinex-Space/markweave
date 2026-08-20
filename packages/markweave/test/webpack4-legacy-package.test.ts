import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const readWorkspaceFile = (path: string) => readFileSync(resolve(workspaceRoot, path), "utf8");

describe("Webpack 4 legacy package contract", () => {
  it("publishes physical ES2019 entry files for resolvers that ignore package exports", () => {
    const corePackage = JSON.parse(readWorkspaceFile("packages/markweave/package.json"));
    const vue2Package = JSON.parse(readWorkspaceFile("packages/markweave-vue2/package.json"));

    expect(corePackage.exports["./legacy"]).toEqual({
      types: "./legacy.d.ts",
      import: "./legacy.js",
      default: "./legacy.js",
    });
    expect(corePackage.files).toEqual(expect.arrayContaining(["legacy.js", "legacy.d.ts"]));
    expect(readWorkspaceFile("packages/markweave/legacy.js")).toContain('from "./dist/legacy/index.js"');

    expect(vue2Package.exports["./legacy"]).toEqual({
      types: "./legacy.d.ts",
      import: "./legacy.js",
      default: "./legacy.js",
    });
    expect(vue2Package.exports["./webpack4"]).toEqual({
      types: "./webpack4/index.d.cts",
      require: "./webpack4/index.cjs",
      default: "./webpack4/index.cjs",
    });
    expect(vue2Package.files).toEqual(expect.arrayContaining(["legacy.js", "legacy.d.ts", "webpack4"]));
    expect(readWorkspaceFile("packages/markweave-vue2/legacy.js")).toContain('from "./dist/legacy/index.js"');
    expect(vue2Package.dependencies).toEqual(expect.objectContaining({
      "prosemirror-model": "1.25.11",
      "prosemirror-state": "1.4.4",
      "prosemirror-view": "1.42.2",
    }));
  });

  it("prebundles heavy features while preserving one host-owned editor runtime", () => {
    const sharedBuildConfig = readWorkspaceFile("scripts/legacy-vite-config.ts");
    const workspaceConfig = readWorkspaceFile("pnpm-workspace.yaml");
    const coreBuildConfig = readWorkspaceFile("packages/markweave/vite.legacy.config.ts");
    const vue2BuildConfig = readWorkspaceFile("packages/markweave-vue2/vite.legacy.config.ts");

    expect(coreBuildConfig).toContain('target: "es2019"');
    expect(vue2BuildConfig).toContain('target: "es2019"');
    expect(coreBuildConfig).toContain("mermaid/dist/mermaid.min.js");
    expect(vue2BuildConfig).toContain("mermaid/dist/mermaid.min.js");
    expect(sharedBuildConfig).toContain("markweave-legacy-mermaid-single-file");
    expect(sharedBuildConfig).toContain('"@tiptap/core"');
    expect(sharedBuildConfig).toContain('"@tiptap/pm"');
    expect(sharedBuildConfig).toContain('"prosemirror-"');
    expect(vue2BuildConfig).toContain('createLegacyRuntimeExternal(["@tiptap/vue-2", "vue"])');
    expect(vue2BuildConfig).toContain("/^markweave\\/internal/");
    expect(workspaceConfig).toContain("overrides:");
    expect(workspaceConfig).toContain("prosemirror-model: 1.25.11");
    expect(workspaceConfig).toContain("prosemirror-state: 1.4.4");
    expect(workspaceConfig).toContain("prosemirror-view: 1.42.2");
  });

  it("ships a narrow webpack-chain helper with a persistent Babel cache", () => {
    const helper = readWorkspaceFile("packages/markweave-vue2/webpack4/index.cjs");

    expect(helper).toContain("markweave-vue2-legacy-shared-runtime-js");
    expect(helper).toContain(".cache/markweave-babel-loader");
    expect(helper).toContain('"@markweave/vue2$"');
    expect(helper).toContain('"@tiptap/core/jsx-runtime$"');
    expect(helper).toContain('"@tiptap/vue-2/menus$"');
    expect(helper).toContain("TIPTAP_PM_SUBPATHS");
    expect(helper).not.toContain('"mermaid"');
    expect(helper).not.toContain('"cytoscape"');
    expect(helper).not.toContain('"lowlight"');
  });

  it("keeps the real Vue CLI 4 fixture available as a release gate", () => {
    const rootPackage = JSON.parse(readWorkspaceFile("package.json"));
    const playgroundConfig = readWorkspaceFile("apps/playground-vue2/vue.config.js");

    expect(rootPackage.scripts["build:vue2-legacy"]).toContain("build-vue2-legacy-playground.mjs");
    expect(playgroundConfig).toContain('MARKWEAVE_VUE2_LEGACY === "1"');
    expect(playgroundConfig).toContain("applyMarkweaveVue2Webpack4Legacy");
    expect(playgroundConfig).toContain("config.resolve.symlinks(false)");
  });
});
