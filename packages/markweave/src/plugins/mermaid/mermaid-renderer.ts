export type MermaidPreviewMode = "code" | "preview";

export interface MermaidPreviewState {
  readonly active: boolean;
  readonly mode: MermaidPreviewMode;
  readonly source: string;
  readonly shouldRenderPreview: boolean;
  readonly sourceRecoverable: boolean;
}

export type MermaidRenderResult =
  | {
      readonly status: "empty";
      readonly svg: "";
      readonly error: null;
    }
  | {
      readonly status: "rendered";
      readonly svg: string;
      readonly error: null;
    }
  | {
      readonly status: "error";
      readonly svg: "";
      readonly error: string;
    };

export type MermaidPreviewPresentation =
  | {
      readonly visibility: "hidden";
      readonly sourceRecoverable: false;
    }
  | {
      readonly visibility: "empty";
      readonly label: "Mermaid preview";
      readonly sourceRecoverable: true;
    }
  | {
      readonly visibility: "rendered";
      readonly svg: string;
      readonly sourceRecoverable: true;
    }
  | {
      readonly visibility: "error";
      readonly message: string;
      readonly sourceRecoverable: true;
    };

export interface MermaidRenderer {
  render(id: string, source: string): Promise<{ svg: string }>;
}

export const markweaveMermaidBehavior = {
  defaultMode: "code",
  previewMode: "preview",
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    background: "transparent",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    primaryColor: "#eef0ea",
    primaryTextColor: "#2f352e",
    primaryBorderColor: "#bcc6b7",
    lineColor: "#7c8a74",
    tertiaryColor: "#f8faf6",
  },
} as const;

let mermaidInitialized = false;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeMermaidPreviewMode(mode: unknown): MermaidPreviewMode {
  return mode === markweaveMermaidBehavior.previewMode ? markweaveMermaidBehavior.previewMode : markweaveMermaidBehavior.defaultMode;
}

export function getMermaidPreviewState(options: {
  readonly active: boolean;
  readonly mode: unknown;
  readonly source: string;
}): MermaidPreviewState {
  const mode = options.active ? normalizeMermaidPreviewMode(options.mode) : markweaveMermaidBehavior.defaultMode;
  const source = options.active ? options.source : "";

  return {
    active: options.active,
    mode,
    source,
    shouldRenderPreview: options.active && mode === markweaveMermaidBehavior.previewMode,
    sourceRecoverable: options.active,
  };
}

export function getMermaidPreviewPresentation(options: {
  readonly active: boolean;
  readonly mode: MermaidPreviewMode;
  readonly result: MermaidRenderResult;
}): MermaidPreviewPresentation {
  if (!options.active || options.mode !== markweaveMermaidBehavior.previewMode) {
    return {
      visibility: "hidden",
      sourceRecoverable: false,
    };
  }

  if (options.result.status === "rendered") {
    return {
      visibility: "rendered",
      svg: options.result.svg,
      sourceRecoverable: true,
    };
  }

  if (options.result.status === "error") {
    return {
      visibility: "error",
      message: options.result.error,
      sourceRecoverable: true,
    };
  }

  return {
    visibility: "empty",
    label: "Mermaid preview",
    sourceRecoverable: true,
  };
}

async function loadMermaidRenderer(): Promise<MermaidRenderer> {
  const mermaidModule = await import("mermaid");
  const mermaid = mermaidModule.default;

  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: markweaveMermaidBehavior.securityLevel,
      theme: markweaveMermaidBehavior.theme,
      themeVariables: markweaveMermaidBehavior.themeVariables,
    });
    mermaidInitialized = true;
  }

  return {
    render: (id, source) => mermaid.render(id, source),
  };
}

export async function renderMermaidDiagram(
  source: string,
  options: {
    readonly id?: string;
    readonly renderer?: MermaidRenderer;
  } = {},
): Promise<MermaidRenderResult> {
  const trimmedSource = source.trim();

  if (!trimmedSource) {
    return { status: "empty", svg: "", error: null };
  }

  try {
    const renderer = options.renderer ?? (await loadMermaidRenderer());
    const { svg } = await renderer.render(options.id ?? `markweave-mermaid-${Date.now()}`, trimmedSource);
    return { status: "rendered", svg, error: null };
  } catch (error) {
    return { status: "error", svg: "", error: getErrorMessage(error) };
  }
}
