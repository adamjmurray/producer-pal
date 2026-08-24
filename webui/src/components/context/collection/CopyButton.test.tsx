// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installClipboardMock } from "#webui/test-utils/clipboard-test-helpers";
import { CopyButton } from "#webui/components/context/collection/CopyButton";

describe("CopyButton", () => {
  const writeText = installClipboardMock();

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes the text and confirms with a 'Copied' label", async () => {
    render(<CopyButton text="hello" />);

    fireEvent.click(screen.getByText("Copy"));

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("reverts the label to 'Copy' after the confirmation window", async () => {
    vi.useFakeTimers();
    render(<CopyButton text="hello" />);

    await act(async () => {
      fireEvent.click(screen.getByText("Copy"));
      // Flush the clipboard write's microtask so the "Copied" state lands.
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Copied")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText("Copy")).toBeTruthy();
  });

  it("supports custom idle and confirmation labels", async () => {
    render(<CopyButton text="x" label="Copy blob" copiedLabel="Done" />);

    fireEvent.click(screen.getByText("Copy blob"));

    expect(await screen.findByText("Done")).toBeTruthy();
  });

  it("keeps the idle label and does not throw when the write is denied", async () => {
    writeText.mockRejectedValue(new Error("clipboard denied"));
    render(<CopyButton text="x" />);

    fireEvent.click(screen.getByText("Copy"));

    // Let the rejected clipboard promise settle, then confirm the label is
    // unchanged (the rejection was swallowed, not surfaced or thrown).
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Copy")).toBeTruthy();
    expect(screen.queryByText("Copied")).toBeNull();
  });
});
