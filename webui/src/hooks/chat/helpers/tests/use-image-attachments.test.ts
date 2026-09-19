// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useImageAttachments } from "#webui/hooks/chat/helpers/use-image-attachments";

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
