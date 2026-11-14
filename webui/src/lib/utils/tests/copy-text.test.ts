// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyText } from "#webui/lib/utils/copy-text";

/**
 * Set `navigator.clipboard`, or remove it as plain-HTTP pages do.
 * @param value - The clipboard, or undefined for none
 */
function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
}

describe("copyText", () => {
  let execCommand: ReturnType<typeof vi.fn>;
  let copiedFromTextarea: string | undefined;

  beforeEach(() => {
    copiedFromTextarea = undefined;
    execCommand = vi.fn(() => {
      copiedFromTextarea = document.querySelector("textarea")?.value;

      return true;
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
  });

  afterEach(() => {
    setClipboard(undefined);
    vi.restoreAllMocks();
  });

  it("uses the async clipboard when there is one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    setClipboard({ writeText });

    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("copies through a textarea when the page has no clipboard API", async () => {
    setClipboard(undefined);

    expect(await copyText("hello")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(copiedFromTextarea).toBe("hello");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the async write is denied", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });

    expect(await copyText("hello")).toBe(true);
    expect(copiedFromTextarea).toBe("hello");
  });

  it("reports failure when the copy command refuses", async () => {
    setClipboard(undefined);
    execCommand.mockReturnValue(false);

    expect(await copyText("hello")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure when the copy command throws", async () => {
    setClipboard(undefined);
    execCommand.mockImplementation(() => {
      throw new Error("not allowed");
    });

    expect(await copyText("hello")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("gives focus back to the element that had it", async () => {
    const button = document.createElement("button");

    document.body.appendChild(button);
    button.focus();
    setClipboard(undefined);

    await copyText("hello");

    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
