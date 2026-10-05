// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { AttachImagesButton } from "#webui/components/chat/controls/composer/AttachImagesButton";

/**
 * Fire a change on the hidden picker with the given file list.
 * @param files - What the picker reports as chosen
 * @returns The picker input
 */
function pick(files: File[] | null): HTMLInputElement {
  const input = screen.getByTestId("image-file-input") as HTMLInputElement;

  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);

  return input;
}

describe("AttachImagesButton", () => {
  it("hands the picked files to onFiles", () => {
    const onFiles = vi.fn();
    const file = new File(["x"], "a.png", { type: "image/png" });

    render(<AttachImagesButton disabled={false} onFiles={onFiles} />);
    pick([file]);

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("reports no files when the picker has no file list", () => {
    const onFiles = vi.fn();

    render(<AttachImagesButton disabled={false} onFiles={onFiles} />);
    const input = pick(null);

    expect(onFiles).toHaveBeenCalledWith([]);
    expect(input.value).toBe("");
  });
});
