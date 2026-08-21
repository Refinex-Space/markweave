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
    const candidate = path.join(searchPath, "node_modules", packageName);
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

function setExistingAlias(config, request, target) {
  if (target && fs.existsSync(target)) {
    config.resolve.alias.set(request, target);
  }
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
  const searchPaths = [projectRoot, packageRoot];
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

  if (options.aliasPackageImport !== false) {
    setExistingAlias(config, "@markweave/vue2$", legacyEntry);
  }
  setExistingAlias(config, "@markweave/vue2/legacy$", legacyEntry);
  setExistingAlias(config, "@markweave/vue2/styles.css$", path.join(packageRoot, "styles.css"));

  if (tiptapCoreRoot) {
    setExistingAlias(
      config,
      "@tiptap/core/jsx-runtime$",
      path.join(tiptapCoreRoot, "dist/jsx-runtime/index.js"),
    );
  }
  if (tiptapVue2Root) {
    setExistingAlias(config, "@tiptap/vue-2$", path.join(tiptapVue2Root, "dist/index.js"));
    setExistingAlias(config, "@tiptap/vue-2/menus$", path.join(tiptapVue2Root, "dist/menus/index.js"));
  }
  if (tiptapPmRoot) {
    TIPTAP_PM_SUBPATHS.forEach((subpath) => {
      setExistingAlias(
        config,
        `@tiptap/pm/${subpath}$`,
        path.join(tiptapPmRoot, `dist/${subpath}/index.js`),
      );
    });
  }
  prosemirrorRoots.forEach((dependencyRoot, packageName) => {
    setExistingAlias(
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
