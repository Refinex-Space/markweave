import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { chromium } from "@playwright/test";

const port = Number(process.env.MARKWEAVE_BENCHMARK_PORT ?? 4173);
const baseUrl = process.env.MARKWEAVE_BENCHMARK_URL ?? `http://127.0.0.1:${port}`;
const production = process.env.MARKWEAVE_BENCHMARK_DEV !== "1";
const repetitions = Math.max(1, Number(process.env.MARKWEAVE_BENCHMARK_RUNS ?? 3));
const fixtureNames = process.argv.slice(2);
const fixtures = fixtureNames.length
  ? fixtureNames
  : [
      "250k Text Fixture",
      "250k Valid Media Fixture",
      "250k Missing Media Fixture",
      "250k Mixed Media Fixture",
      "1MB Stress Fixture",
    ];
if (!process.env.MARKWEAVE_BENCHMARK_URL && production) {
  const build = spawnSync(
    "pnpm",
    ["--filter", "@markweave/playground-react", "build"],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  if (build.status !== 0) {
    throw new Error("Failed to build the React playground for benchmarking.");
  }
}

const server = process.env.MARKWEAVE_BENCHMARK_URL
  ? null
  : spawn(
      "pnpm",
      production
        ? ["--filter", "@markweave/playground-react", "exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port)]
        : ["--filter", "@markweave/playground-react", "dev", "--port", String(port)],
      { cwd: process.cwd(), stdio: "ignore" },
    );

try {
  await waitForServer(baseUrl);
  const browser = await launchBenchmarkBrowser();
  try {
    const results = [];
    const benchmarkCases = fixtures.flatMap((fixture) =>
      Array.from({ length: repetitions }, (_, run) => ({ fixture, run: run + 1 })),
    );
    for (const { fixture, run } of benchmarkCases) {
      const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
      await page.addInitScript(() => {
        globalThis.__markweaveBenchmark = { loadStates: [], longTasks: [] };
        try {
          const observer = new PerformanceObserver((entries) => {
            for (const entry of entries.getEntries()) {
              globalThis.__markweaveBenchmark.longTasks.push({
                duration: entry.duration,
                startTime: entry.startTime,
              });
            }
          });
          observer.observe({ type: "longtask", buffered: true });
        } catch {
          // Long Task API is diagnostic-only and may be unavailable.
        }
      });
      await page.goto(`${baseUrl}?benchmark=1`, { waitUntil: "networkidle" });
      await page.locator("details.markweave-debug-panel").evaluate((element) => {
        element.open = true;
      });
      const profiling = process.env.MARKWEAVE_BENCHMARK_PROFILE === "1";
      const cdp = profiling ? await page.context().newCDPSession(page) : null;
      if (cdp) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.start");
      }
      await page.evaluate(() => {
        if (globalThis.__markweaveBenchmark) {
          globalThis.__markweaveBenchmark.loadStates = [];
          globalThis.__markweaveBenchmark.longTasks = [];
        }
      });
      const startedAt = await page.evaluate(() => performance.now());
      await page.getByRole("button", { name: fixture, exact: true }).click();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="markweave-editor-frame"]')
            ?.getAttribute("data-markweave-large-document-loading") !== "true",
        undefined,
        { timeout: 30_000 },
      );
      const editor = page.locator('[contenteditable="true"]');
      await editor.waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForFunction(
        () => document.querySelectorAll(".ProseMirror > *").length > 0,
        undefined,
        { timeout: 30_000 },
      );
      const mountedAt = await page.evaluate(() => performance.now());
      await editor.click({ position: { x: 24, y: 24 } });
      const inputSamples = [];
      for (const character of "benchmark-performance") {
        const inputStartedAt = await page.evaluate(() => performance.now());
        await page.keyboard.insertText(character);
        const elapsed = await page.evaluate(
          (startedAt) =>
            new Promise((resolve) =>
              requestAnimationFrame(() => resolve(performance.now() - startedAt)),
            ),
          inputStartedAt,
        );
        inputSamples.push(elapsed);
      }
      const result = await page.evaluate(
        ({ fixture, inputSamples, mountedAt, run, startedAt }) => {
          const round = (value) => Math.round(value * 10) / 10;
          const percentile = (values, value) => {
            const sorted = [...values].sort((left, right) => left - right);
            return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] ?? 0;
          };
          const benchmark = globalThis.__markweaveBenchmark;
          const longTasks = benchmark?.longTasks ?? [];
          const loadStates = benchmark?.loadStates ?? [];
          const parsingAt = loadStates.find((state) => state.phase === "parsing")?.at ?? startedAt;
          const mountingStates = loadStates.filter(
            (state) => state.phase === "mounting" && state.at >= parsingAt,
          );
          const mountingAt = mountingStates[0]?.at ?? parsingAt;
          const finalizingAt = loadStates.find(
            (state) => state.phase === "finalizing" && state.at >= mountingAt,
          )?.at ?? mountingAt;
          const readyAt = loadStates.find(
            (state) => state.phase === "ready" && state.at >= finalizingAt,
          )?.at ?? finalizingAt;
          const mountBatchIntervals = mountingStates.slice(1).map(
            (state, index) => state.at - mountingStates[index].at,
          );
          const memory = performance.memory;
          return {
            domNodes: document.querySelectorAll("*").length,
            fixture,
            inputToPaintP95Ms: round(percentile(inputSamples, 0.95)),
            inputToPaintP99Ms: round(percentile(inputSamples, 0.99)),
            finalizingMs: round(readyAt - finalizingAt),
            markdownParseMs: round(mountingAt - parsingAt),
            longestTaskMs: round(Math.max(0, ...longTasks.map((task) => task.duration))),
            longestTaskStartMs: round(
              (longTasks.slice().sort((left, right) => right.duration - left.duration)[0]?.startTime ?? startedAt) - startedAt,
            ),
            longTaskCount: longTasks.length,
            mountBatchMaxMs: round(Math.max(0, ...mountBatchIntervals)),
            mountBatchP95Ms: round(percentile(mountBatchIntervals, 0.95)),
            mountingMs: round(finalizingAt - mountingAt),
            mountMs: round(mountedAt - startedAt),
            nodeViews: document.querySelectorAll('[data-markweave-lightweight-image="true"]').length,
            rendererHeapBytes: memory?.usedJSHeapSize ?? null,
            run,
          };
        },
        { fixture, inputSamples, mountedAt, run, startedAt },
      );
      const searchSection = fixture === "1MB Stress Fixture" ? 2_500 : 500;
      const searchMetrics = await page.evaluate(
        async ({ query }) => {
          const controller = globalThis.__markweaveSearchController;
          if (!controller) {
            return {
              searchDecorationCount: 0,
              searchLocateMs: null,
              searchReadyMs: null,
              searchTargetVisible: false,
            };
          }
          const startedAt = performance.now();
          const readyAt = await new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => {
              unsubscribe();
              reject(new Error("Search benchmark timed out."));
            }, 5_000);
            const unsubscribe = controller.subscribe((state) => {
              const status = state.execution?.status;
              if (status === "ready" || (!status && state.matchCount > 0)) {
                window.clearTimeout(timeout);
                unsubscribe();
                resolve(performance.now());
              } else if (status === "error") {
                window.clearTimeout(timeout);
                unsubscribe();
                reject(new Error(state.error || "Search benchmark failed."));
              }
            });
            controller.setQuery(query);
          });
          const visibilityDeadline = performance.now() + 750;
          let searchTargetVisible = false;
          do {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            const activeMatch = document.querySelector(".markweave-search-match--active");
            const rect = activeMatch?.getBoundingClientRect();
            searchTargetVisible = Boolean(
              activeMatch && rect && rect.width > 0 && rect.height > 0 &&
                rect.bottom >= 0 && rect.top <= window.innerHeight &&
                isVisibleWithinScrollChain(activeMatch, rect),
            );
          } while (!searchTargetVisible && performance.now() < visibilityDeadline);
          const locatedAt = performance.now();
          const searchDecorationCount = document.querySelectorAll(".markweave-search-match").length;
          controller.clear();
          return {
            searchDecorationCount,
            searchLocateMs: Math.round((locatedAt - readyAt) * 10) / 10,
            searchReadyMs: Math.round((readyAt - startedAt) * 10) / 10,
            searchTargetVisible,
          };

          function isVisibleWithinScrollChain(element, rect) {
            let visibleTop = 0;
            let visibleBottom = window.innerHeight;
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              const overflowY = getComputedStyle(parent).overflowY;
              if (!/^(auto|scroll|hidden|clip)$/.test(overflowY)) continue;
              const parentRect = parent.getBoundingClientRect();
              visibleTop = Math.max(visibleTop, parentRect.top);
              visibleBottom = Math.min(visibleBottom, parentRect.bottom);
            }
            return visibleBottom > visibleTop && rect.bottom >= visibleTop && rect.top <= visibleBottom;
          }
        },
        { query: `Performance section ${searchSection}` },
      );
      Object.assign(result, searchMetrics);
      const scrollMetrics = await page.evaluate(async () => {
        const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        window.scrollTo({ behavior: "auto", top: 0 });
        await nextFrame();
        await nextFrame();
        const startedAt = performance.now();
        let scrollReachedEnd = false;
        let scrollEndErrorPx = Number.POSITIVE_INFINITY;
        let scrollTargetVisible = false;
        for (let frame = 0; frame < 12; frame += 1) {
          const scrollHeight = Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ?? 0,
          );
          window.scrollTo({ behavior: "auto", top: scrollHeight });
          await nextFrame();
          const currentHeight = Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ?? 0,
          );
          scrollEndErrorPx = Math.max(
            0,
            currentHeight - (window.scrollY + window.innerHeight),
          );
          scrollReachedEnd = scrollEndErrorPx <= 16;
          const lastBlock = document.querySelector(".ProseMirror")?.lastElementChild;
          const lastBlockRect = lastBlock?.getBoundingClientRect();
          scrollTargetVisible = Boolean(
            lastBlock && lastBlockRect && lastBlockRect.width > 0 && lastBlockRect.height > 0 &&
              lastBlockRect.bottom >= 0 &&
              lastBlockRect.top <= window.innerHeight &&
              isVisibleWithinScrollChain(lastBlock, lastBlockRect),
          );
          if (scrollReachedEnd && scrollTargetVisible) {
            break;
          }
        }
        const scrollToEndMs = Math.round((performance.now() - startedAt) * 10) / 10;
        window.scrollTo({ behavior: "auto", top: 0 });
        return {
          scrollEndErrorPx: Math.round(scrollEndErrorPx * 10) / 10,
          scrollReachedEnd,
          scrollTargetVisible,
          scrollToEndMs,
        };

        function isVisibleWithinScrollChain(element, rect) {
          let visibleTop = 0;
          let visibleBottom = window.innerHeight;
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const overflowY = getComputedStyle(parent).overflowY;
            if (!/^(auto|scroll|hidden|clip)$/.test(overflowY)) continue;
            const parentRect = parent.getBoundingClientRect();
            visibleTop = Math.max(visibleTop, parentRect.top);
            visibleBottom = Math.min(visibleBottom, parentRect.bottom);
          }
          return visibleBottom > visibleTop && rect.bottom >= visibleTop && rect.top <= visibleBottom;
        }
      });
      Object.assign(result, scrollMetrics);
      if (cdp) {
        const { profile } = await cdp.send("Profiler.stop");
        result.profile = summarizeCpuProfile(profile);
        await cdp.detach();
      }
      results.push(result);
      await page.close();
    }

    process.stdout.write(`${JSON.stringify({
      mode: production ? "production" : "development",
      platform: process.platform,
      repetitions,
      results: summarizeBenchmarkResults(fixtures, results),
      samples: results,
      version: 4,
    }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
} finally {
  server?.kill("SIGTERM");
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for benchmark server at ${url}`);
}

async function launchBenchmarkBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Executable doesn't exist")) {
      throw error;
    }
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const hits = new Map();
  for (const sample of profile.samples ?? []) {
    hits.set(sample, (hits.get(sample) ?? 0) + 1);
  }
  return [...hits.entries()]
    .map(([id, samples]) => {
      const frame = nodes.get(id)?.callFrame;
      return {
        function: frame?.functionName || "(anonymous)",
        line: frame?.lineNumber ?? null,
        samples,
        url: frame?.url ?? "",
      };
    })
    .sort((left, right) => right.samples - left.samples)
    .slice(0, 20);
}

function summarizeBenchmarkResults(fixtures, samples) {
  return fixtures.map((fixture) => {
    const fixtureSamples = samples.filter((sample) => sample.fixture === fixture);
    const summary = { fixture };
    const keys = new Set(fixtureSamples.flatMap((sample) => Object.keys(sample)));
    for (const key of keys) {
      if (key === "fixture" || key === "profile" || key === "run") continue;
      const values = fixtureSamples.map((sample) => sample[key]);
      const numericValues = values.filter((value) => typeof value === "number");
      if (numericValues.length === values.length) {
        summary[key] = median(numericValues);
      } else if (values.every((value) => typeof value === "boolean")) {
        summary[key] = values.every(Boolean);
      } else {
        summary[key] = values[values.length - 1] ?? null;
      }
    }
    return summary;
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10
    : sorted[middle];
}
