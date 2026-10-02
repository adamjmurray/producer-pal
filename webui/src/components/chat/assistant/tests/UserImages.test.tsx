// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { UserImages } from "#webui/components/chat/assistant/UserImages";
import { type UIPart } from "#webui/types/messages";

const imageParts: UIPart[] = [
  { type: "image", mediaType: "image/png", data: "AAA" },
  { type: "image", mediaType: "image/webp", data: "BBB" },
  { type: "text", content: "match this" },
];

describe("UserImages", () => {
  it("renders a thumbnail per image part and ignores the rest", () => {
    render(<UserImages parts={imageParts} />);

    const images = screen.getAllByRole("img");

    expect(images).toHaveLength(2);
    expect(images[0]?.getAttribute("src")).toBe("data:image/png;base64,AAA");
    expect(images[1]?.getAttribute("src")).toBe("data:image/webp;base64,BBB");
  });

  it("renders nothing when the message has no images", () => {
    const { container } = render(
      <UserImages parts={[{ type: "text", content: "no pictures" }]} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("toggles one image to full size and back", () => {
    render(<UserImages parts={imageParts} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand image 1" }));

    expect(screen.getByAltText("Attached image 1").className).toContain(
      "w-full",
    );
    // The other image is unaffected.
    expect(screen.getByAltText("Attached image 2").className).toContain(
      "max-h-40",
    );

    fireEvent.click(screen.getByRole("button", { name: "Shrink image 1" }));

    expect(screen.getByAltText("Attached image 1").className).toContain(
      "max-h-40",
    );
  });
});
