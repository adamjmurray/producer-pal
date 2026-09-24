// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatImage } from "#webui/chat/sdk/types";
import { useImageAttachments } from "#webui/hooks/chat/helpers/use-image-attachments";
import {
  attachImages,
  TOO_MANY_IMAGES_MESSAGE,
} from "#webui/utils/image-attachments";

vi.mock(import("#webui/utils/image-attachments"), async (importOriginal) => ({
  ...(await importOriginal()),
  attachImages: vi.fn(),
}));

/** Finishes the oldest `attachImages` call still reading. */
let finishNextRead: () => Promise<void>;

/**
 * A drag event carrying the given data transfer, with the two methods the
 * handlers call.
 * @param dataTransfer - The event's dataTransfer, or null
 * @returns A drag event stand-in
 */
function dragEvent(dataTransfer: unknown): DragEvent {
  return {
    dataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent;
}

describe("useImageAttachments pastes that carry no real image", () => {
  it("leaves a paste whose only image is empty to the editor", () => {
    const { result } = renderHook(() => useImageAttachments());
    const empty = new File([], "image.png", { type: "image/png" });
    const event = {
      clipboardData: { files: [empty] },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as ClipboardEvent;

    result.current.zoneProps.onPasteCapture(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(attachImages).not.toHaveBeenCalled();
  });
});

describe("useImageAttachments drags that carry nothing to attach", () => {
  it("ignores a drop whose file list never materialized", async () => {
    const { result } = renderHook(() => useImageAttachments());

    // Some browsers hand over a Files-typed transfer with no list behind it.
    // Nothing to read, so nothing is attached and no notice is raised.
    await act(() => {
      result.current.zoneProps.onDropCapture(
        dragEvent({ types: ["Files"], files: null }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.images).toStrictEqual([]);
    expect(result.current.notice).toBeNull();
    expect(result.current.dragging).toBe(false);
  });

  it("leaves the drag depth alone when the drag carries no files", async () => {
    const { result } = renderHook(() => useImageAttachments());

    await act(() => {
      result.current.zoneProps.onDragEnterCapture(
        dragEvent({ types: ["Files"] }),
      );
    });

    expect(result.current.dragging).toBe(true);

    // A text drag leaving the zone is not this zone's drag ending.
    await act(() => {
      result.current.zoneProps.onDragLeaveCapture(
        dragEvent({ types: ["text/plain"] }),
      );
    });

    expect(result.current.dragging).toBe(true);
  });
});

describe("useImageAttachments adds that finish after the list changed", () => {
  beforeEach(() => {
    const reads: Array<() => void> = [];

    // Like the real one (each file becomes an image appended to `current`),
    // but it only finishes when the test says so.
    vi.mocked(attachImages).mockImplementation(
      (current, files) =>
        new Promise((resolve) => {
          const added = files.map((file): ChatImage => ({
            mediaType: file.type,
            data: file.name,
          }));

          reads.push(() =>
            resolve({ images: [...current, ...added], notice: null }),
          );
        }),
    );

    finishNextRead = async () => {
      await act(async () => {
        reads.shift()?.();
        await Promise.resolve();
      });
    };
  });

  /**
   * Start adding one image file per name.
   * @param attachments - The hook's current result
   * @param names - File names, which become each image's data
   */
  function add(
    attachments: ReturnType<typeof useImageAttachments>,
    ...names: string[]
  ): void {
    void act(() => {
      attachments.addFiles(
        names.map((name) => new File(["xy"], name, { type: "image/png" })),
      );
    });
  }

  /**
   * The attached images' data, in order.
   * @param attachments - The hook's current result
   * @returns Each image's data
   */
  const attached = (attachments: ReturnType<typeof useImageAttachments>) =>
    attachments.images.map((image) => image.data);

  it("keeps both images when a second paste starts before the first finishes", async () => {
    const { result } = renderHook(() => useImageAttachments());

    add(result.current, "A");
    add(result.current, "B");
    await finishNextRead();

    // Still loading until the last read lands.
    expect(result.current.loading).toBe(true);
    await finishNextRead();

    expect(attached(result.current)).toStrictEqual(["A", "B"]);
    expect(result.current.loading).toBe(false);
  });

  it("doesn't bring back sent images when a paste finishes after clear", async () => {
    const { result } = renderHook(() => useImageAttachments());

    add(result.current, "A");
    await finishNextRead();
    add(result.current, "B");
    void act(() => result.current.clear());
    await finishNextRead();

    // B wasn't sent, so it stays for the next message.
    expect(attached(result.current)).toStrictEqual(["B"]);
  });

  it("doesn't bring back an image removed while a paste was loading", async () => {
    const { result } = renderHook(() => useImageAttachments());

    add(result.current, "A");
    await finishNextRead();
    add(result.current, "B");
    void act(() => result.current.removeImage(0));
    await finishNextRead();

    expect(attached(result.current)).toStrictEqual(["B"]);
  });

  it("caps images from overlapping pastes at the per-message limit", async () => {
    const { result } = renderHook(() => useImageAttachments());
    const names = (prefix: string) =>
      Array.from({ length: 6 }, (_, i) => `${prefix}${i}`);

    add(result.current, ...names("a"));
    add(result.current, ...names("b"));
    await finishNextRead();
    await finishNextRead();

    expect(attached(result.current)).toStrictEqual([
      ...names("a"),
      ...names("b").slice(0, 4),
    ]);
    expect(result.current.notice).toBe(TOO_MANY_IMAGES_MESSAGE);
  });
});
