export type MarkweaveBrowserFileData = Blob | (() => Promise<Blob>);

export interface MarkweaveBrowserFileSaveOptions {
  readonly data: MarkweaveBrowserFileData;
  readonly fallbackHref?: string;
  readonly fileName: string;
  readonly onSettled?: () => void;
  readonly ownerDocument?: Document;
}

interface MarkweaveSaveFileHandle {
  createWritable(): Promise<{
    close(): Promise<void>;
    write(data: Blob): Promise<void>;
  }>;
}

interface MarkweaveSaveFilePickerWindow extends Window {
  readonly URL: typeof URL;
  showSaveFilePicker?: (options: { readonly suggestedName: string; readonly startIn: string }) => Promise<MarkweaveSaveFileHandle>;
}

function isSavePickerCancellation(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function triggerBrowserFileDownload(options: MarkweaveBrowserFileSaveOptions, ownerDocument: Document, ownerWindow: MarkweaveSaveFilePickerWindow | null) {
  let href = options.fallbackHref;
  let objectUrl: string | undefined;

  if (!href && typeof options.data !== "function" && ownerWindow && typeof ownerWindow.URL.createObjectURL === "function") {
    objectUrl = ownerWindow.URL.createObjectURL(options.data);
    href = objectUrl;
  }

  if (!href) {
    return false;
  }

  const anchor = ownerDocument.createElement("a");
  anchor.href = href;
  anchor.download = options.fileName;
  anchor.rel = "noopener noreferrer";
  ownerDocument.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (objectUrl) {
    ownerWindow?.URL.revokeObjectURL(objectUrl);
  }

  return true;
}

async function resolveBrowserFileData(data: MarkweaveBrowserFileData) {
  return typeof data === "function" ? data() : data;
}

async function saveBrowserFileWithPicker(
  options: MarkweaveBrowserFileSaveOptions,
  ownerDocument: Document,
  ownerWindow: MarkweaveSaveFilePickerWindow,
  showSaveFilePicker: NonNullable<MarkweaveSaveFilePickerWindow["showSaveFilePicker"]>,
) {
  try {
    const fileHandle = await showSaveFilePicker.call(ownerWindow, { suggestedName: options.fileName, startIn: "downloads" });
    const data = await resolveBrowserFileData(options.data);
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  } catch (error) {
    if (!isSavePickerCancellation(error)) {
      triggerBrowserFileDownload(options, ownerDocument, ownerWindow);
    }
  } finally {
    options.onSettled?.();
  }
}

export function saveMarkweaveBrowserFile(options: MarkweaveBrowserFileSaveOptions) {
  const ownerDocument = options.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView as MarkweaveSaveFilePickerWindow | null;
  const showSaveFilePicker = ownerWindow?.showSaveFilePicker;

  if (!options.fileName.trim()) {
    return false;
  }

  if (!ownerWindow || typeof showSaveFilePicker !== "function") {
    const downloaded = triggerBrowserFileDownload(options, ownerDocument, ownerWindow);
    options.onSettled?.();
    return downloaded;
  }

  void saveBrowserFileWithPicker(options, ownerDocument, ownerWindow, showSaveFilePicker);
  return true;
}
