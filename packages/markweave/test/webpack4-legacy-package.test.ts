import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyVue2Webpack4Stats } from "../../../scripts/verify-vue2-webpack4-stats.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const readWorkspaceFile = (path: string) => readFileSync(resolve(workspaceRoot, path), "utf8");
const require = createRequire(import.meta.url);

function createWebpackChainStub() {
  const aliases = new Map<string, string>();
  const extensions = new Set<string>();
  const rules = new Map<string, {
    includes: Set<string>;
    type: string | null;
    uses: Map<string, { loader: string | null; options: unknown }>;
  }>();
  const config = {
    resolve: {
      alias: { set: (request: string, target: string) => aliases.set(request, target) },
      extensions: { add: (extension: string) => extensions.add(extension) },
    },
    module: {
      rule(name: string) {
        const state = { includes: new Set<string>(), type: null as string | null, uses: new Map<string, { loader: string | null; options: unknown }>() };
        rules.set(name, state);
        const rule = {
          test: () => rule,
          type: (value: string) => { state.type = value; return rule; },
          include: { add: (value: string) => { state.includes.add(value); return rule; } },
          use(useName: string) {
            const useState = { loader: null as string | null, options: null as unknown };
            state.uses.set(useName, useState);
            const use = {
              loader: (value: string) => { useState.loader = value; return use; },
              options: (value: unknown) => { useState.options = value; return use; },
            };
            return use;
          },
        };
        return rule;
      },
    },
  };
  return { aliases, config, extensions, rules };
}

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
    expect(helper).toContain("fs.realpathSync(packageRoot)");
    expect(helper).toContain("runtime versions are misaligned");
    expect(helper).toContain('"@markweave/vue2$"');
    expect(helper).toContain('"@tiptap/core$"');
    expect(helper).toContain('"@tiptap/core/jsx-runtime$"');
    expect(helper).toContain('"@tiptap/vue-2/menus$"');
    expect(helper).toContain("TIPTAP_PM_SUBPATHS");
    expect(helper).not.toContain('"mermaid"');
    expect(helper).not.toContain('"cytoscape"');
    expect(helper).not.toContain('"lowlight"');
  });

  it("applies required physical aliases to one shared Tiptap runtime", () => {
    const applyMarkweaveVue2Webpack4Legacy = require("../../markweave-vue2/webpack4/index.cjs") as (config: unknown, options: { projectRoot: string }) => void;
    const stub = createWebpackChainStub();

    applyMarkweaveVue2Webpack4Legacy(stub.config, {
      projectRoot: resolve(workspaceRoot, "apps/playground-vue2"),
    });

    expect(stub.aliases.get("@tiptap/core$")).toMatch(/@tiptap\/core\/dist\/index\.js$/);
    expect(stub.aliases.get("vue$")).toMatch(/vue\/dist\/vue\.runtime\.common\.js$/);
    expect(stub.aliases.get("markweave/styles.css$")).toMatch(/markweave\/dist\/styles\.css$/);
    expect(stub.aliases.get("./markweave/styles.css$")).toBe(stub.aliases.get("markweave/styles.css$"));
    expect(stub.aliases.get("@tiptap/core/jsx-runtime$")).toMatch(/@tiptap\/core\/jsx-runtime\/index\.js$/);
    expect(stub.aliases.get("@tiptap/vue-2$")).toMatch(/@tiptap\/vue-2\/dist\/index\.js$/);
    expect(stub.aliases.get("@tiptap/vue-2/menus$")).toMatch(/@tiptap\/vue-2\/dist\/menus\/index\.js$/);
    expect(stub.aliases.get("@tiptap/pm/state$")).toMatch(/@tiptap\/pm\/dist\/state\/index\.js$/);
    expect(stub.aliases.get("prosemirror-state$")).toMatch(/prosemirror-state\/dist\/index\.js$/);
    expect(stub.extensions).toContain(".mjs");
    expect(stub.rules.get("markweave-vue2-legacy-shared-runtime-js")?.uses.get("babel-loader")?.loader).toBe("babel-loader");
  });

  it("rejects duplicate runtime roots and accepts a bounded singleton graph", () => {
    const runtimeModules = [
      "vue",
      "@tiptap/core",
      "@tiptap/vue-2",
      "@tiptap/pm",
      "prosemirror-model",
      "prosemirror-state",
      "prosemirror-view",
    ].map((packageName) => ({ identifier: `/consumer/node_modules/${packageName}/dist/index.js` }));
    const stats = {
      modules: runtimeModules,
      assets: [
        { name: "js/app.js", size: 100_000 },
        { name: "js/chunk.js", size: 200_000 },
      ],
      entrypoints: { app: { assets: ["js/app.js"] } },
    };

    expect(verifyVue2Webpack4Stats(stats).runtimeRoots["@tiptap/core"]).toEqual([
      "/consumer/node_modules/@tiptap/core",
    ]);
    expect(() => verifyVue2Webpack4Stats({
      ...stats,
      modules: [
        ...runtimeModules,
        { identifier: "/consumer/node_modules/@tiptap/vue-2/node_modules/@tiptap/core/dist/index.js" },
      ],
    })).toThrow(/@tiptap\/core: expected one Webpack runtime root, received 2/);
  });

  it("keeps the real Vue CLI 4 fixture available as a release gate", () => {
    const rootPackage = JSON.parse(readWorkspaceFile("package.json"));
    const playgroundConfig = readWorkspaceFile("apps/playground-vue2/vue.config.js");

    expect(rootPackage.scripts["build:vue2-legacy"]).toContain("build-vue2-legacy-playground.mjs");
    expect(rootPackage.scripts["verify:vue2-packed"]).toContain("verify-vue2-packed-consumer.mjs");
    expect(rootPackage.scripts["release:verify"]).toContain("pnpm build:vue2-legacy");
    expect(rootPackage.scripts["release:verify"]).toContain("pnpm verify:vue2-packed");
    expect(rootPackage.scripts["release:pack"]).toContain("pnpm release:verify");
    expect(rootPackage.scripts["release:dry-run"]).toContain("pnpm release:verify");
    expect(readWorkspaceFile("scripts/build-vue2-legacy-playground.mjs")).toContain("verifyVue2Webpack4StatsFile");
    expect(readWorkspaceFile("scripts/verify-vue2-packed-consumer.mjs")).toContain('name: "minimum"');
    expect(readWorkspaceFile("scripts/verify-vue2-packed-consumer.mjs")).toContain('name: "final"');
    expect(playgroundConfig).toContain('MARKWEAVE_VUE2_LEGACY === "1"');
    expect(playgroundConfig).toContain("applyMarkweaveVue2Webpack4Legacy");
    expect(playgroundConfig).toContain("config.resolve.symlinks(false)");
  });
});
