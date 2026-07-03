// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dragHasFiles,
  downloadTextFile,
  markdownExportFilename,
  markdownFileFromDataTransfer,
  pickTextFile,
} from "#webui/utils/text-file-io";

/**
 * A minimal File-like stub for drag/pick tests (happy-dom's File is fine, but
 * this keeps `text()` controllable and avoids constructing Blobs).
 * @param name - File name
 * @param type - MIME type
 * @param text - Resolved/rejected body
 * @returns A File-shaped object
 */
function fakeFile(
  name: string,
  type: string,
  text: () => Promise<string> = () => Promise.resolve("body"),
): File {
  return { name, type, text } as unknown as File;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadTextFile", () => {
  it("creates a dated anchor download and revokes the object URL", () => {
    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLElement;

    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:x");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockReturnValue();

    downloadTextFile("my-file.md", "# hi");

    expect(createUrl).toHaveBeenCalledOnce();
    expect((anchor as unknown as HTMLAnchorElement).download).toBe(
      "my-file.md",
    );
    expect((anchor as unknown as HTMLAnchorElement).href).toBe("blob:x");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith("blob:x");
  });
});

describe("pickTextFile", () => {
  /**
   * Stub document.createElement to return a controllable file input whose
   * `click` immediately triggers `onchange` with the given files.
   * @param files - Files the picker resolves with (empty = user picked none)
   * @returns The stubbed input
   */
  function stubInput(files: File[]): {
    type: string;
    accept: string;
    files: File[];
    onchange: (() => void) | null;
    click: () => void;
  } {
    const input = {
      type: "",
      accept: "",
      files,
      onchange: null as (() => void) | null,
      click: (): void => input.onchange?.(),
    };

    vi.spyOn(document, "createElement").mockReturnValue(
      input as unknown as HTMLElement,
    );

    return input;
  }

  it("resolves the chosen file's text", async () => {
    stubInput([fakeFile("x.md", "text/markdown", () => Promise.resolve("hi"))]);

    await expect(pickTextFile(".md")).resolves.toBe("hi");
  });

  it("sets the accept filter on the input", async () => {
    const input = stubInput([fakeFile("x.md", "text/markdown")]);

    await pickTextFile(".md,.markdown");

    expect(input.accept).toBe(".md,.markdown");
  });

  it("resolves null when no file is picked", async () => {
    stubInput([]);

    await expect(pickTextFile(".md")).resolves.toBeNull();
  });

  it("resolves null when the read fails", async () => {
    stubInput([
      fakeFile("x.md", "text/markdown", () =>
        Promise.reject(new Error("boom")),
      ),
    ]);

    await expect(pickTextFile(".md")).resolves.toBeNull();
  });
});

describe("dragHasFiles", () => {
  it("is true when the drag carries files", () => {
    expect(dragHasFiles({ types: ["Files"] } as unknown as DataTransfer)).toBe(
      true,
    );
  });

  it("is false for a text drag or a null transfer", () => {
    expect(
      dragHasFiles({ types: ["text/plain"] } as unknown as DataTransfer),
    ).toBe(false);
    expect(dragHasFiles(null)).toBe(false);
  });
});

describe("markdownFileFromDataTransfer", () => {
  it("returns a .md file by extension even when the MIME type is blank", () => {
    const file = fakeFile("notes.md", "");
    const dt = { files: [file] } as unknown as DataTransfer;

    expect(markdownFileFromDataTransfer(dt)).toBe(file);
  });

  it("returns a text/* file by MIME type", () => {
    const file = fakeFile("weird-name", "text/plain");
    const dt = { files: [file] } as unknown as DataTransfer;

    expect(markdownFileFromDataTransfer(dt)).toBe(file);
  });

  it("rejects a non-text file", () => {
    const dt = {
      files: [fakeFile("cover.png", "image/png")],
    } as unknown as DataTransfer;

    expect(markdownFileFromDataTransfer(dt)).toBeNull();
  });

  it("returns null when the transfer has no files", () => {
    expect(
      markdownFileFromDataTransfer({ files: [] } as unknown as DataTransfer),
    ).toBeNull();
    expect(markdownFileFromDataTransfer(null)).toBeNull();
  });
});

describe("markdownExportFilename", () => {
  it("slugifies the basename and appends today's date and .md", () => {
    expect(markdownExportFilename("Producer Pal: Global Context!")).toMatch(
      /^producer-pal-global-context-\d{4}-\d{2}-\d{2}\.md$/,
    );
  });
});
