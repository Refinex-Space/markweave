import { useEffect, useMemo, useState } from "react";
import { getMermaidPreviewPresentation, renderMermaidDiagram, type MermaidPreviewMode, type MermaidRenderResult } from "markweave/internal/plugins/mermaid/mermaid-renderer";

interface MermaidPreviewProps {
  readonly active: boolean;
  readonly mode: MermaidPreviewMode;
  readonly source: string;
}

const emptyResult: MermaidRenderResult = {
  status: "empty",
  svg: "",
  error: null,
};

export function MermaidPreview({ active, mode, source }: MermaidPreviewProps) {
  const [result, setResult] = useState<MermaidRenderResult>(emptyResult);
  const previewId = useMemo(() => `markweave-mermaid-preview-${Math.abs(hashSource(source))}`, [source]);
  const presentation = getMermaidPreviewPresentation({ active, mode, result });

  useEffect(() => {
    let cancelled = false;

    if (!active || mode !== "preview") {
      setResult(emptyResult);
      return () => {
        cancelled = true;
      };
    }

    setResult(emptyResult);
    void renderMermaidDiagram(source, { id: previewId }).then((nextResult) => {
      if (!cancelled) {
        setResult(nextResult);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [active, mode, previewId, source]);

  if (presentation.visibility === "hidden") {
    return null;
  }

  if (presentation.visibility === "rendered") {
    return (
      <div className="markweave-mermaid-preview" data-testid="markweave-mermaid-preview" dangerouslySetInnerHTML={{ __html: presentation.svg }} />
    );
  }

  if (presentation.visibility === "error") {
    return (
      <div className="markweave-mermaid-preview markweave-mermaid-preview--error" data-testid="markweave-mermaid-preview-error">
        {presentation.message}
      </div>
    );
  }

  return (
    <div className="markweave-mermaid-preview markweave-mermaid-preview--empty" data-testid="markweave-mermaid-preview-empty">
      {presentation.label}
    </div>
  );
}

function hashSource(source: string) {
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}
