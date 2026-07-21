const DEFAULT_CHUNK_SIZE = 32_768;

export function splitMarkweaveLargeMarkdown(
  markdown: string,
  targetSize = DEFAULT_CHUNK_SIZE,
) {
  if (markdown.length <= targetSize) {
    return [markdown];
  }

  const chunks: string[] = [];
  let chunkStart = 0;
  let cursor = 0;
  let fenced = false;
  let fenceMarker = "";
  let calloutDepth = 0;

  while (cursor < markdown.length) {
    const lineEnd = markdown.indexOf("\n", cursor);
    const end = lineEnd === -1 ? markdown.length : lineEnd + 1;
    const line = markdown.slice(cursor, lineEnd === -1 ? end : lineEnd);
    const fence = line.match(/^\s*(`{3,}|~{3,})/);

    if (fence) {
      const marker = fence[1]![0]!;
      if (!fenced) {
        fenced = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        fenced = false;
        fenceMarker = "";
      }
    } else if (!fenced && /^:::[a-z]+\s*$/i.test(line)) {
      calloutDepth += 1;
    } else if (!fenced && calloutDepth > 0 && /^:::\s*$/.test(line)) {
      calloutDepth -= 1;
    }

    const canSplit =
      !fenced &&
      calloutDepth === 0 &&
      cursor > chunkStart &&
      cursor - chunkStart >= targetSize &&
      /^#{1,6}\s+\S/.test(line);
    if (canSplit) {
      chunks.push(markdown.slice(chunkStart, cursor));
      chunkStart = cursor;
    }
    cursor = end;
  }

  chunks.push(markdown.slice(chunkStart));
  return chunks.filter(Boolean);
}
