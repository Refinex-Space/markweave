export interface Vue2Webpack4StatsBudgets {
  readonly entrypointBytes: number;
  readonly javascriptBytes: number;
  readonly largestAssetBytes: number;
}

export interface Vue2Webpack4StatsSummary {
  readonly entrypointBytes: number;
  readonly javascriptBytes: number;
  readonly largestAssetBytes: number;
  readonly runtimeRoots: Record<string, string[]>;
}

export interface Vue2Webpack4Stats {
  readonly assets?: ReadonlyArray<{ readonly name: string; readonly size?: number }>;
  readonly entrypoints?: Record<string, {
    readonly assets?: ReadonlyArray<string | { readonly name: string }>;
  }>;
  readonly modules?: ReadonlyArray<{
    readonly identifier?: string;
    readonly name?: string;
    readonly modules?: Vue2Webpack4Stats["modules"];
  }>;
}

export declare function verifyVue2Webpack4Stats(
  stats: Vue2Webpack4Stats,
  budgets?: Vue2Webpack4StatsBudgets,
): Vue2Webpack4StatsSummary;

export declare function verifyVue2Webpack4StatsFile(
  statsPath: string,
  budgets?: Vue2Webpack4StatsBudgets,
): Vue2Webpack4StatsSummary;
