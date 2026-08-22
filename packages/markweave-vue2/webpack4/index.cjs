"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TIPTAP_PM_SUBPATHS = [
  "changeset",
  "commands",
  "dropcursor",
  "gapcursor",
  "history",
  "inputrules",
  "keymap",
  "model",
  "schema-list",
  "state",
  "tables",
  "transform",
  "view",
];
const PROSEMIRROR_RUNTIME_PACKAGES = [
  "prosemirror-model",
  "prosemirror-state",
  "prosemirror-view",
];

function findPackageRoot(packageName, searchPaths) {
  for (const searchPath of searchPaths) {
    let current = fs.existsSync(searchPath) ? fs.realpathSync(searchPath) : path.resolve(searchPath);
    while (current !== path.dirname(current)) {
      const candidate = path.join(current, "node_modules", packageName);
      const manifest = path.join(candidate, "package.json");
      if (fs.existsSync(manifest)) {
        try {
          if (JSON.parse(fs.readFileSync(manifest, "utf8")).name === packageName) {
            return fs.realpathSync(candidate);
          }
        } catch {
          return null;
        }
      }
      current = path.dirname(current);
    }
  }

  let entry;
  try {
    entry = require.resolve(packageName, { paths: searchPaths });
  } catch {
    return null;
  }

  let current = path.dirname(entry);
  while (current !== path.dirname(current)) {
    const manifest = path.join(current, "package.json");
    if (fs.existsSync(manifest)) {
      try {
        if (JSON.parse(fs.readFileSync(manifest, "utf8")).name === packageName) {
          return fs.realpathSync(current);
        }
      } catch {
        return null;
      }
    }
    current = path.dirname(current);
  }
  return null;
}

function setRequiredAlias(config, request, target) {
  if (!target || !fs.existsSync(target)) {
    throw new Error(`@markweave/vue2 Webpack 4 alias target is missing: ${request} -> ${target || "unresolved"}`);
  }

  config.resolve.alias.set(request, target);
}

function readPackageManifest(packageRoot) {
  return JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
}

function addBabelRule(config, ruleName, test, dependencyRoots, cacheDirectory, asJavascriptAuto) {
  const rule = config.module.rule(ruleName).test(test);
  if (asJavascriptAuto) {
    rule.type("javascript/auto");
  }
  dependencyRoots.forEach((dependencyRoot) => rule.include.add(dependencyRoot));
  rule
    .use("babel-loader")
    .loader("babel-loader")
    .options({
      cacheCompression: false,
      cacheDirectory,
      presets: ["@vue/cli-plugin-babel/preset"],
    });
}

function applyMarkweaveVue2Webpack4Legacy(config, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const cacheDirectory = path.resolve(
    options.cacheDirectory
      || process.env.MARKWEAVE_BABEL_CACHE_DIR
      || path.join(projectRoot, ".cache/markweave-babel-loader"),
  );
  const installedPackageRoot = path.join(projectRoot, "node_modules/@markweave/vue2");
  const packageRoot = fs.existsSync(installedPackageRoot)
    ? installedPackageRoot
    : path.resolve(__dirname, "..");
  const searchPaths = [projectRoot, packageRoot, fs.realpathSync(packageRoot)];
  const vueRoot = findPackageRoot("vue", searchPaths);
  const markweaveRoot = findPackageRoot("markweave", searchPaths);
  const tiptapCoreRoot = findPackageRoot("@tiptap/core", searchPaths);
  const tiptapPmRoot = findPackageRoot("@tiptap/pm", searchPaths);
  const tiptapVue2Root = findPackageRoot("@tiptap/vue-2", searchPaths);
  const prosemirrorRoots = new Map(
    PROSEMIRROR_RUNTIME_PACKAGES.map((packageName) => [
      packageName,
      findPackageRoot(packageName, searchPaths),
    ]),
  );
  const missingPackages = [
    ["vue", vueRoot],
    ["markweave", markweaveRoot],
    ["@tiptap/core", tiptapCoreRoot],
    ["@tiptap/pm", tiptapPmRoot],
    ["@tiptap/vue-2", tiptapVue2Root],
    ...prosemirrorRoots.entries(),
  ].filter(([, packagePath]) => !packagePath).map(([packageName]) => packageName);
  const legacyEntry = path.join(packageRoot, "legacy.js");

  if (!fs.existsSync(legacyEntry) || missingPackages.length > 0) {
    throw new Error(
      `@markweave/vue2 Webpack 4 legacy setup is incomplete. Missing: ${[
        ...(!fs.existsSync(legacyEntry) ? ["@markweave/vue2/legacy.js"] : []),
        ...missingPackages,
      ].join(", ")}`,
    );
  }

  const packageManifest = readPackageManifest(packageRoot);
  const exactRuntimeRoots = new Map([
    ["@tiptap/core", tiptapCoreRoot],
    ["@tiptap/pm", tiptapPmRoot],
    ["@tiptap/vue-2", tiptapVue2Root],
    ...prosemirrorRoots.entries(),
  ]);
  const mismatchedPackages = [];
  exactRuntimeRoots.forEach((runtimeRoot, packageName) => {
    const expectedVersion = packageManifest.dependencies?.[packageName];
    const actualVersion = runtimeRoot ? readPackageManifest(runtimeRoot).version : null;
    if (expectedVersion && actualVersion !== expectedVersion) {
      mismatchedPackages.push(`${packageName} expected ${expectedVersion}, received ${actualVersion || "missing"}`);
    }
  });
  if (mismatchedPackages.length) {
    throw new Error(`@markweave/vue2 Webpack 4 runtime versions are misaligned: ${mismatchedPackages.join(", ")}`);
  }

  if (options.aliasPackageImport !== false) {
    setRequiredAlias(config, "@markweave/vue2$", legacyEntry);
  }
  setRequiredAlias(config, "@markweave/vue2/legacy$", legacyEntry);
  setRequiredAlias(config, "@markweave/vue2/styles.css$", path.join(packageRoot, "styles.css"));
  setRequiredAlias(config, "markweave/styles.css$", markweaveRoot && path.join(markweaveRoot, "dist/styles.css"));
  setRequiredAlias(config, "./markweave/styles.css$", markweaveRoot && path.join(markweaveRoot, "dist/styles.css"));
  setRequiredAlias(config, "vue$", vueRoot && path.join(vueRoot, "dist/vue.runtime.common.js"));

  if (tiptapCoreRoot) {
    setRequiredAlias(config, "@tiptap/core$", path.join(tiptapCoreRoot, "dist/index.js"));
    setRequiredAlias(
      config,
      "@tiptap/core/jsx-runtime$",
      path.join(tiptapCoreRoot, "jsx-runtime/index.js"),
    );
  }
  if (tiptapVue2Root) {
    setRequiredAlias(config, "@tiptap/vue-2$", path.join(tiptapVue2Root, "dist/index.js"));
    setRequiredAlias(config, "@tiptap/vue-2/menus$", path.join(tiptapVue2Root, "dist/menus/index.js"));
  }
  if (tiptapPmRoot) {
    TIPTAP_PM_SUBPATHS.forEach((subpath) => {
      setRequiredAlias(
        config,
        `@tiptap/pm/${subpath}$`,
        path.join(tiptapPmRoot, `dist/${subpath}/index.js`),
      );
    });
  }
  prosemirrorRoots.forEach((dependencyRoot, packageName) => {
    setRequiredAlias(
      config,
      `${packageName}$`,
      dependencyRoot && path.join(dependencyRoot, "dist/index.js"),
    );
  });

  if (config.resolve.extensions && typeof config.resolve.extensions.add === "function") {
    config.resolve.extensions.add(".mjs");
  }

  const dependencyRoots = [tiptapCoreRoot, tiptapPmRoot, tiptapVue2Root].filter(Boolean);
  if (dependencyRoots.length > 0) {
    addBabelRule(
      config,
      "markweave-vue2-legacy-shared-runtime-js",
      /\.js$/,
      dependencyRoots,
      cacheDirectory,
      false,
    );
    addBabelRule(
      config,
      "markweave-vue2-legacy-shared-runtime-mjs",
      /\.mjs$/,
      dependencyRoots,
      cacheDirectory,
      true,
    );
  }
}

module.exports = applyMarkweaveVue2Webpack4Legacy;
module.exports.applyMarkweaveVue2Webpack4Legacy = applyMarkweaveVue2Webpack4Legacy;
