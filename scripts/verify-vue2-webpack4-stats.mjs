import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const runtimePackages = [
  "vue",
  "@tiptap/core",
  "@tiptap/vue-2",
  "@tiptap/pm",
  "prosemirror-model",
  "prosemirror-state",
  "prosemirror-view",
];

const defaultBudgets = {
  entrypointBytes: 2.3 * 1024 * 1024,
  javascriptBytes: 6 * 1024 * 1024,
  largestAssetBytes: 4 * 1024 * 1024,
};

function walkModules(modules, visit) {
  for (const module of modules ?? []) {
    visit(module);
    walkModules(module.modules, visit);
  }
}

function normalizeIdentifier(identifier) {
  return identifier.replaceAll("\\", "/").split("!").at(-1)?.split("?")[0] ?? identifier;
}

function findRuntimeRoot(identifier, packageName) {
  const normalized = normalizeIdentifier(identifier);
  const marker = `/node_modules/${packageName}/`;
  const index = normalized.lastIndexOf(marker);
  if (index < 0) {
    return null;
  }
  return normalized.slice(0, index + marker.length - 1);
}

function getEntrypointAssetNames(entrypoint) {
  return (entrypoint?.assets ?? []).map((asset) => typeof asset === "string" ? asset : asset.name);
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

export function verifyVue2Webpack4Stats(stats, budgets = defaultBudgets) {
  const runtimeRoots = new Map(runtimePackages.map((packageName) => [packageName, new Set()]));
  walkModules(stats.modules, (module) => {
    const identifier = module.identifier ?? module.name;
    if (typeof identifier !== "string") {
      return;
    }
    runtimeRoots.forEach((roots, packageName) => {
      const root = findRuntimeRoot(identifier, packageName);
      if (root) {
        roots.add(root);
      }
    });
  });

  const errors = [];
  runtimeRoots.forEach((roots, packageName) => {
    if (roots.size !== 1) {
      errors.push(`${packageName}: expected one Webpack runtime root, received ${roots.size}${roots.size ? ` (${[...roots].join(", ")})` : ""}`);
    }
  });

  const assets = new Map((stats.assets ?? []).map((asset) => [asset.name, asset.size ?? 0]));
  const entrypointAssetNames = getEntrypointAssetNames(stats.entrypoints?.app);
  const entrypointBytes = entrypointAssetNames.reduce((total, name) => total + (assets.get(name) ?? 0), 0);
  const javascriptBytes = [...assets.entries()]
    .filter(([name]) => name.endsWith(".js"))
    .reduce((total, [, size]) => total + size, 0);
  const largestAssetBytes = Math.max(0, ...assets.values());

  if (!entrypointAssetNames.length) {
    errors.push("app entrypoint assets are missing from Webpack stats");
  }
  if (entrypointBytes > budgets.entrypointBytes) {
    errors.push(`app entrypoint exceeds ${formatBytes(budgets.entrypointBytes)}: ${formatBytes(entrypointBytes)}`);
  }
  if (javascriptBytes > budgets.javascriptBytes) {
    errors.push(`JavaScript assets exceed ${formatBytes(budgets.javascriptBytes)}: ${formatBytes(javascriptBytes)}`);
  }
  if (largestAssetBytes > budgets.largestAssetBytes) {
    errors.push(`largest asset exceeds ${formatBytes(budgets.largestAssetBytes)}: ${formatBytes(largestAssetBytes)}`);
  }

  if (errors.length) {
    throw new Error(`Vue 2 Webpack 4 stats verification failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    entrypointBytes,
    javascriptBytes,
    largestAssetBytes,
    runtimeRoots: Object.fromEntries([...runtimeRoots].map(([packageName, roots]) => [packageName, [...roots]])),
  };
}

export function verifyVue2Webpack4StatsFile(statsPath, budgets) {
  return verifyVue2Webpack4Stats(JSON.parse(readFileSync(statsPath, "utf8")), budgets);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const statsPath = resolve(process.argv[2] ?? "apps/playground-vue2/dist/report.json");
  const summary = verifyVue2Webpack4StatsFile(statsPath);
  process.stdout.write(`[Markweave Webpack 4 Stats] ${JSON.stringify(summary)}\n`);
}
