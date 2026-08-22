import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { verifyVue2Webpack4StatsFile } from "./verify-vue2-webpack4-stats.mjs";

const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error("Run this verification through the pnpm build:vue2-legacy script.");
}

const startedAt = performance.now();
const statsPath = resolve("apps/playground-vue2/dist/report.json");
const result = spawnSync(
  process.execPath,
  [pnpmCli, "--filter", "@markweave/playground-vue2", "exec", "vue-cli-service", "build", "--report-json"],
  {
    env: {
      ...process.env,
      MARKWEAVE_VUE2_LEGACY: "1",
    },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  const summary = verifyVue2Webpack4StatsFile(statsPath);
  rmSync(statsPath, { force: true });
  process.stdout.write(`[Markweave Webpack 4 Legacy] consumer build completed in ${((performance.now() - startedAt) / 1_000).toFixed(2)}s. ${JSON.stringify(summary)}\n`);
}
