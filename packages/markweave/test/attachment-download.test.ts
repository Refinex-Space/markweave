// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  activateMarkweaveAttachmentDownload,
  attrsFromMarkweaveAttachmentUploadResult,
  createMarkweaveAttachmentRefFromAttrs,
  createMarkweaveAttachmentUploadRequest,
  formatMarkweaveAttachmentSize,
  openMarkweaveAttachmentFallbackDownload,
} from "../src/plugins/media/attachment-download";

describe("attachment upload and download contract helpers", () => {
  it("maps upload results into persistent attachment attrs", () => {
    expect(
      attrsFromMarkweaveAttachmentUploadResult({
        src: "https://cdn.example.com/files/spec.pdf",
        name: "spec.pdf",
        mimeType: "application/pdf",
        size: 2048,
      }),
    ).toEqual({
      src: "https://cdn.example.com/files/spec.pdf",
      name: "spec.pdf",
      mimeType: "application/pdf",
      size: 2048,
    });

    expect(
      attrsFromMarkweaveAttachmentUploadResult({
        src: "/uploads/report.docx",
      }),
    ).toEqual({
      src: "/uploads/report.docx",
      name: "report.docx",
      mimeType: null,
      size: null,
    });
  });

  it("builds attachment refs and upload requests for host handlers", () => {
    expect(
      createMarkweaveAttachmentRefFromAttrs({
        src: "attachment://doc-42",
        name: "brief.md",
        mimeType: "text/markdown",
        size: 128,
      }),
    ).toEqual({
      src: "attachment://doc-42",
      name: "brief.md",
      mimeType: "text/markdown",
      size: 128,
    });

    expect(createMarkweaveAttachmentRefFromAttrs({ src: null })).toBeNull();
    expect(
      createMarkweaveAttachmentUploadRequest({
        type: "file",
        file: new File(["hello"], "notes.txt", { type: "text/plain" }),
        mimeType: "text/plain",
      }),
    ).toEqual({
      kind: "attachment",
      trigger: "attachment-insert",
      source: {
        type: "file",
        file: expect.any(File),
        mimeType: "text/plain",
      },
    });
  });

  it("formats sizes and activates host download or http(s) fallback", () => {
    expect(formatMarkweaveAttachmentSize(512)).toBe("512 B");
    expect(formatMarkweaveAttachmentSize(2048)).toBe("2.0 KB");
    expect(formatMarkweaveAttachmentSize(null, "n/a")).toBe("n/a");

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const handler = vi.fn();
    const attachment = createMarkweaveAttachmentRefFromAttrs({
      src: "https://cdn.example.com/a.pdf",
      name: "a.pdf",
    });
    const context = { mode: "live" as const, event: new MouseEvent("click") };

    expect(attachment).not.toBeNull();
    expect(activateMarkweaveAttachmentDownload(attachment!, context, handler)).toBe(true);
    expect(handler).toHaveBeenCalledWith(attachment, context);
    expect(openSpy).not.toHaveBeenCalled();

    expect(activateMarkweaveAttachmentDownload(attachment!, context)).toBe(true);
    expect(openSpy).toHaveBeenCalledWith("https://cdn.example.com/a.pdf", "_blank", "noopener,noreferrer");

    expect(openMarkweaveAttachmentFallbackDownload("javascript:alert(1)")).toBe(false);
    expect(openMarkweaveAttachmentFallbackDownload("attachment://opaque")).toBe(false);
    openSpy.mockRestore();
  });
});
