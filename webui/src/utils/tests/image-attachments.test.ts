// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_ACCEPT,
  IMAGE_READ_ERROR_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  NOT_AN_IMAGE_MESSAGE,
  TOO_MANY_IMAGES_MESSAGE,
  attachImages,
  imageDataUrl,
  imageFilesFrom,
} from "#webui/utils/image-attachments";

/**
 * A real File the browser's FileReader can read.
 * @param name - File name
 * @param type - MIME type
 * @param size - Reported byte size (defaults to the real body length)
 * @returns The file
 */
function makeFile(name: string, type: string, size?: number): File {
  const file = new File(["xy"], name, { type });

  if (size != null) {
    Object.defineProperty(file, "size", { value: size });
  }

  return file;
}

describe("attachImages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads accepted images to base64 and keeps the existing ones first", async () => {
    const current = [{ mediaType: "image/gif", data: "AAA" }];
    const result = await attachImages(current, [
      makeFile("shot.png", "image/png"),
    ]);

    expect(result.notice).toBeNull();
    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toStrictEqual(current[0]);
    expect(result.images[1]?.mediaType).toBe("image/png");
    // "xy" base64-encoded, with no data: URL prefix left on it.
    expect(result.images[1]?.data).toBe("eHk=");
  });

  it("rejects a file that isn't a supported image type", async () => {
    const result = await attachImages(
      [],
      [makeFile("notes.txt", "text/plain")],
    );

    expect(result.images).toStrictEqual([]);
    expect(result.notice).toBe(NOT_AN_IMAGE_MESSAGE);
  });

  it("rejects an image over the size cap but keeps the others", async () => {
    const result = await attachImages(
      [],
      [
        makeFile("huge.png", "image/png", MAX_IMAGE_BYTES + 1),
        makeFile("ok.webp", "image/webp"),
      ],
    );

    expect(result.notice).toBe(IMAGE_TOO_LARGE_MESSAGE);
    expect(result.images.map((i) => i.mediaType)).toStrictEqual(["image/webp"]);
  });

  it("caps the number of images per message", async () => {
    const files = Array.from({ length: MAX_IMAGES_PER_MESSAGE + 1 }, (_, i) =>
      makeFile(`${i}.png`, "image/png"),
    );
    const result = await attachImages([], files);

    expect(result.images).toHaveLength(MAX_IMAGES_PER_MESSAGE);
    expect(result.notice).toBe(TOO_MANY_IMAGES_MESSAGE);
  });

  it("counts images already attached against the cap", async () => {
    const current = Array.from({ length: MAX_IMAGES_PER_MESSAGE }, () => ({
      mediaType: "image/png",
      data: "AAA",
    }));
    const result = await attachImages(current, [
      makeFile("one-more.png", "image/png"),
    ]);

    expect(result.images).toHaveLength(MAX_IMAGES_PER_MESSAGE);
    expect(result.notice).toBe(TOO_MANY_IMAGES_MESSAGE);
  });

  it.each([
    { name: "the read fails", fail: true, result: "" },
    { name: "the read returns nothing usable", fail: false, result: null },
  ])("reports an unreadable image when $name", async ({ fail, result }) => {
    vi.stubGlobal(
      "FileReader",
      class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        result: string | null = result;
        readAsDataURL(): void {
          if (fail) {
            this.onerror?.();
          } else {
            this.onload?.();
          }
        }
      },
    );

    const attached = await attachImages([], [makeFile("x.png", "image/png")]);

    expect(attached.images).toStrictEqual([]);
    expect(attached.notice).toBe(IMAGE_READ_ERROR_MESSAGE);
  });
});

describe("imageFilesFrom", () => {
  it("keeps image files and drops everything else", () => {
    const image = makeFile("a.png", "image/png");
    const text = makeFile("a.txt", "text/plain");

    expect(imageFilesFrom([image, text] as unknown as FileList)).toStrictEqual([
      image,
    ]);
  });

  it("tolerates a paste or drop carrying no files", () => {
    expect(imageFilesFrom(null)).toStrictEqual([]);
  });
});

describe("constants", () => {
  it("accepts only the image types every provider reads", () => {
    expect(IMAGE_ACCEPT).toBe("image/png,image/jpeg,image/gif,image/webp");
  });

  it("builds a data URL for rendering", () => {
    expect(imageDataUrl({ mediaType: "image/png", data: "AAA" })).toBe(
      "data:image/png;base64,AAA",
    );
  });
});
