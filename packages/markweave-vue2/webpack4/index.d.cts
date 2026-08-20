interface MarkweaveVue2Webpack4LegacyOptions {
  projectRoot?: string;
  cacheDirectory?: string;
  aliasPackageImport?: boolean;
}

declare function applyMarkweaveVue2Webpack4Legacy(
  config: any,
  options?: MarkweaveVue2Webpack4LegacyOptions,
): void;

export = applyMarkweaveVue2Webpack4Legacy;
