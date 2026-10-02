// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { AttachedImage } from "#webui/components/chat/controls/composer/AttachedImage";
import { imageDataUrl } from "#webui/utils/image-attachments";

vi.mock(import("#webui/utils/image-attachments"), async (importOriginal) => {
  const original = await importOriginal();

  return { ...original, imageDataUrl: vi.fn(original.imageDataUrl) };
});

describe("AttachedImage", () => {
  it("builds the data URL once while the image data stays the same", () => {
    const png = { mediaType: "image/png", data: "AAA" };
    const { rerender } = render(
      <AttachedImage image={png} alt="shot" className="" />,
    );

    // Each render of the chat hands over a fresh object with the same data.
    rerender(<AttachedImage image={{ ...png }} alt="shot" className="" />);

    expect(screen.getByAltText("shot").getAttribute("src")).toBe(
      "data:image/png;base64,AAA",
    );
    expect(imageDataUrl).toHaveBeenCalledOnce();
  });
});
