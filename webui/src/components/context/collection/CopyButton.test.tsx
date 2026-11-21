// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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

  it("copies without the async clipboard API, as on a plain-HTTP page", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execCommand = vi.fn().mockReturnValue(true);

    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    render(<CopyButton text="hello" />);

    fireEvent.click(screen.getByText("Copy"));

    expect(await screen.findByText("Copied")).toBeTruthy();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("shows 'Copy failed' briefly when nothing can copy", async () => {
    vi.useFakeTimers();
    writeText.mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    render(<CopyButton text="x" failedLabel="Nope" />);

    await act(async () => {
      fireEvent.click(screen.getByText("Copy"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Nope")).toBeTruthy();
    expect(screen.queryByText("Copied")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText("Copy")).toBeTruthy();
  });
});
