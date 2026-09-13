// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import {
  type Mock,
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  IMAGE_ACCEPT,
  IMAGE_READ_ERROR_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  NOT_AN_IMAGE_MESSAGE,
  TOO_MANY_IMAGES_MESSAGE,
  attachImages,
  imageDataUrl,
  imageFilesFrom,
} from "#webui/utils/image-attachments";

/** "scaled" base64-encoded: what a stubbed canvas encode comes back as. */
const SCALED_DATA = "c2NhbGVk";

/** A decoded image the way `createImageBitmap` hands it over. */
interface StubBitmap {
  width: number;
  height: number;
  close: Mock;
}

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

/**
 * Stub decoding, since happy-dom can't decode an image.
 * @param width - Decoded width to report
 * @param height - Decoded height to report
 * @returns The stub bitmap `createImageBitmap` resolves to
 */
function stubBitmap(width: number, height: number): StubBitmap {
  const bitmap = { width, height, close: vi.fn() };

  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

  return bitmap;
}

/**
 * Stub the canvas, since happy-dom has no 2D context and no encoder.
 * @param encode - What `toBlob` gives back for a requested media type
 * @returns The drawImage spy (which records the target size) and the toBlob spy
 */
function stubCanvas(
  encode: (type: string) => Blob | null = (type) =>
    new Blob(["scaled"], { type }),
): { drawImage: Mock; toBlob: MockInstance } {
  const drawImage = vi.fn();

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);

  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback, type) => {
      callback(encode(String(type)));
    });

  return { drawImage, toBlob };
}

/**
 * Stub the `<img>` decode path taken when `createImageBitmap` is missing.
 * @param size - Natural size to report, or null to fail the load
 * @returns The revokeObjectURL spy
 */
function stubImageElement(
  size: { width: number; height: number } | null,
): MockInstance {
  vi.stubGlobal("createImageBitmap", undefined);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:stub");

  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = size?.width ?? 0;
      naturalHeight = size?.height ?? 0;
      set src(_url: string) {
        if (size == null) {
          this.onerror?.();
        } else {
          this.onload?.();
        }
      }
    },
  );

  return revoke;
}

describe("attachImages", () => {
  beforeEach(() => {
    stubBitmap(100, 50);
  });

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

  it("rejects an image still over the size cap but keeps the others", async () => {
    const huge = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.gif", {
      type: "image/gif",
    });
    const result = await attachImages(
      [],
      [huge, makeFile("ok.webp", "image/webp")],
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

describe("image scaling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes an image at or under the limit through untouched", async () => {
    const bitmap = stubBitmap(MAX_IMAGE_DIMENSION, 900);
    const { drawImage } = stubCanvas();
    const result = await attachImages([], [makeFile("fits.png", "image/png")]);

    expect(drawImage).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalled();
    expect(result.images).toStrictEqual([
      { mediaType: "image/png", data: "eHk=" },
    ]);
  });

  it.each([
    { shape: "landscape", width: 4000, height: 2000, drawn: [1568, 784] },
    { shape: "portrait", width: 2000, height: 4000, drawn: [784, 1568] },
  ])("scales a $shape image down", async ({ width, height, drawn }) => {
    const bitmap = stubBitmap(width, height);
    const { drawImage } = stubCanvas();
    const result = await attachImages([], [makeFile("big.png", "image/png")]);

    expect(drawImage).toHaveBeenCalledExactlyOnceWith(bitmap, 0, 0, ...drawn);
    expect(result.images).toStrictEqual([
      { mediaType: "image/png", data: SCALED_DATA },
    ]);
  });

  it("leaves a GIF untouched so its animation survives", async () => {
    const decode = vi.fn();

    vi.stubGlobal("createImageBitmap", decode);

    const { drawImage } = stubCanvas();
    const result = await attachImages([], [makeFile("loop.gif", "image/gif")]);

    expect(decode).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    expect(result.images).toStrictEqual([
      { mediaType: "image/gif", data: "eHk=" },
    ]);
  });

  it("falls back to PNG when the browser can't encode WebP", async () => {
    stubBitmap(4000, 2000);

    const { toBlob } = stubCanvas((type) =>
      type === "image/webp" ? null : new Blob(["scaled"], { type }),
    );
    const result = await attachImages([], [makeFile("big.webp", "image/webp")]);

    expect(toBlob).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      "image/webp",
      0.9,
    );
    expect(result.images).toStrictEqual([
      { mediaType: "image/png", data: SCALED_DATA },
    ]);
  });

  it("attaches an oversized file once scaling has shrunk it", async () => {
    stubBitmap(8000, 4000);
    stubCanvas();

    const twelveMegabytes = 12 * 1024 * 1024;
    const result = await attachImages(
      [],
      [makeFile("screenshot.png", "image/png", twelveMegabytes)],
    );

    expect(result.notice).toBeNull();
    expect(result.images).toStrictEqual([
      { mediaType: "image/png", data: SCALED_DATA },
    ]);
  });

  it("rejects an image that's still too large once encoded", async () => {
    stubBitmap(4000, 2000);
    stubCanvas(
      (type) => new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type }),
    );

    const result = await attachImages([], [makeFile("big.png", "image/png")]);

    expect(result.images).toStrictEqual([]);
    expect(result.notice).toBe(IMAGE_TOO_LARGE_MESSAGE);
  });

  it("reports an unreadable image when decoding fails", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error()));

    const result = await attachImages([], [makeFile("x.png", "image/png")]);

    expect(result.images).toStrictEqual([]);
    expect(result.notice).toBe(IMAGE_READ_ERROR_MESSAGE);
  });

  it("reports an unreadable image when the canvas has no 2D context", async () => {
    stubBitmap(4000, 2000);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const result = await attachImages([], [makeFile("big.png", "image/png")]);

    expect(result.images).toStrictEqual([]);
    expect(result.notice).toBe(IMAGE_READ_ERROR_MESSAGE);
  });

  it("decodes with an <img> when createImageBitmap is missing", async () => {
    const revoke = stubImageElement({ width: 4000, height: 2000 });
    const { drawImage } = stubCanvas();
    const result = await attachImages([], [makeFile("big.png", "image/png")]);

    expect(drawImage).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      0,
      0,
      1568,
      784,
    );
    expect(revoke).toHaveBeenCalledWith("blob:stub");
    expect(result.images).toStrictEqual([
      { mediaType: "image/png", data: SCALED_DATA },
    ]);
  });

  it("reports an unreadable image when the <img> fallback fails to load", async () => {
    const revoke = stubImageElement(null);
    const result = await attachImages([], [makeFile("x.png", "image/png")]);

    expect(revoke).toHaveBeenCalledWith("blob:stub");
    expect(result.images).toStrictEqual([]);
    expect(result.notice).toBe(IMAGE_READ_ERROR_MESSAGE);
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
