// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyDroppedFile,
  dragHasFiles,
  downloadTextFile,
  markdownExportFilename,
  MAX_IMPORT_BYTES,
  pickTextFile,
} from "#webui/utils/text-file-io";

/**
 * A minimal File-like stub for drag/pick tests (happy-dom's File is fine, but
 * this keeps `text()` controllable and avoids constructing Blobs).
 * @param name - File name
 * @param type - MIME type
 * @param text - Resolved/rejected body
 * @param size - Byte size (defaults to 0, i.e. under the import cap)
 * @returns A File-shaped object
 */
function fakeFile(
  name: string,
  type: string,
  text: () => Promise<string> = () => Promise.resolve("body"),
  size = 0,
): File {
  return { name, type, text, size } as unknown as File;
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

  it("resolves null when the picked file exceeds the size cap", async () => {
    stubInput([
      fakeFile(
        "big.md",
        "text/markdown",
        () => Promise.resolve("x"),
        MAX_IMPORT_BYTES + 1,
      ),
    ]);

    await expect(pickTextFile(".md")).resolves.toBeNull();
  });

  it("resolves null when the picker is cancelled", async () => {
    const input = {
      type: "",
      accept: "",
      files: [] as File[],
      onchange: null as (() => void) | null,
      oncancel: null as (() => void) | null,
      // A cancelled picker fires `cancel`, not `change`.
      click: (): void => input.oncancel?.(),
    };

    vi.spyOn(document, "createElement").mockReturnValue(
      input as unknown as HTMLElement,
    );

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

describe("classifyDroppedFile", () => {
  it("classifies a .md file (blank MIME) as importable", () => {
    const file = fakeFile("notes.md", "");
    const dt = { files: [file] } as unknown as DataTransfer;

    expect(classifyDroppedFile(dt)).toStrictEqual({ kind: "file", file });
  });

  it("classifies a text/* file by MIME type as importable", () => {
    const file = fakeFile("weird-name", "text/plain");
    const dt = { files: [file] } as unknown as DataTransfer;

    expect(classifyDroppedFile(dt)).toStrictEqual({ kind: "file", file });
  });

  it("rejects a non-text file as not-markdown", () => {
    const dt = {
      files: [fakeFile("cover.png", "image/png")],
    } as unknown as DataTransfer;

    expect(classifyDroppedFile(dt)).toStrictEqual({ kind: "not-markdown" });
  });

  it("rejects a file over the size cap as too-large", () => {
    const file = fakeFile(
      "huge.md",
      "text/markdown",
      () => Promise.resolve("x"),
      MAX_IMPORT_BYTES + 1,
    );
    const dt = { files: [file] } as unknown as DataTransfer;

    expect(classifyDroppedFile(dt)).toStrictEqual({ kind: "too-large" });
  });

  it("returns none when the transfer has no file", () => {
    expect(
      classifyDroppedFile({ files: [] } as unknown as DataTransfer),
    ).toStrictEqual({ kind: "none" });
    expect(classifyDroppedFile(null)).toStrictEqual({ kind: "none" });
  });
});

describe("markdownExportFilename", () => {
  it("slugifies the basename and appends today's date and .md", () => {
    expect(markdownExportFilename("Producer Pal: Global Context!")).toMatch(
      /^producer-pal-global-context-\d{4}-\d{2}-\d{2}\.md$/,
    );
  });
});
