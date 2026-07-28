import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishablePackages = [
  "packages/markweave",
  "packages/markweave-react",
  "packages/markweave-vue2",
  "packages/markweave-vue3",
];
const errors = [];

function listFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function collectManifestTargets(value) {
  if (typeof value === "string") {
    return value.includes("*") ? [] : [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(collectManifestTargets);
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    errors.push(`${label}: missing ${relative(workspaceRoot, path)}`);
    return false;
  }
  return true;
}

const manifests = publishablePackages.map((packagePath) => {
  const packageRoot = resolve(workspaceRoot, packagePath);
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  return { manifest, packagePath, packageRoot };
});
const expectedVersion = manifests[0].manifest.version;

for (const { manifest, packagePath, packageRoot } of manifests) {
  if (manifest.version !== expectedVersion) {
    errors.push(`${packagePath}: expected version ${expectedVersion}, received ${manifest.version}`);
  }
  if (manifest.scripts?.prepack !== "pnpm run build") {
    errors.push(`${packagePath}: prepack must run pnpm run build`);
  }

  const manifestTargets = [
    manifest.main,
    manifest.module,
    manifest.types,
    manifest.style,
    ...collectManifestTargets(manifest.exports),
  ].filter(Boolean);
  for (const target of new Set(manifestTargets)) {
    requireFile(resolve(packageRoot, target), packagePath);
  }

  const sourceFiles = listFiles(resolve(packageRoot, "src")).filter((path) =>
    [".ts", ".tsx"].includes(extname(path)) && !path.endsWith(".d.ts"),
  );
  const mainOutput = resolve(packageRoot, manifest.main);
  if (sourceFiles.length && requireFile(mainOutput, packagePath)) {
    const newestSource = Math.max(...sourceFiles.map((path) => statSync(path).mtimeMs));
    if (statSync(mainOutput).mtimeMs + 1_000 < newestSource) {
      errors.push(`${packagePath}: build output is older than package source`);
    }
  }
}

const coreRoot = resolve(workspaceRoot, "packages/markweave");
const coreSourceRoot = resolve(coreRoot, "src");
for (const sourcePath of listFiles(coreSourceRoot).filter((path) => path.endsWith(".ts") && !path.endsWith(".d.ts"))) {
  const sourceRelativePath = relative(coreSourceRoot, sourcePath).replace(/\.ts$/, "");
  requireFile(resolve(coreRoot, "dist", `${sourceRelativePath}.js`), "packages/markweave source coverage");
  requireFile(resolve(coreRoot, "dist/types", `${sourceRelativePath}.d.ts`), "packages/markweave declaration coverage");
}

const sourceStyles = resolve(coreSourceRoot, "editor-core/markweave-editor.css");
const builtStyles = resolve(coreRoot, "dist/styles.css");
if (requireFile(builtStyles, "packages/markweave styles") && readFileSync(sourceStyles, "utf8") !== readFileSync(builtStyles, "utf8")) {
  errors.push("packages/markweave: dist/styles.css does not match the editor source stylesheet");
}

const imageClipboardArtifact = resolve(coreRoot, "dist/plugins/media/image-clipboard.js");
if (requireFile(imageClipboardArtifact, "packages/markweave Madora image bridge")) {
  const imageClipboardSource = readFileSync(imageClipboardArtifact, "utf8");
  if (!imageClipboardSource.includes("madoraDrawingReferencePattern") || !imageClipboardSource.includes("madora-asset")) {
    errors.push("packages/markweave: built image clipboard is missing Madora asset and drawing-reference support");
  }
}

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Verified publish artifacts for ${publishablePackages.length} packages at ${expectedVersion}.\n`);
}
