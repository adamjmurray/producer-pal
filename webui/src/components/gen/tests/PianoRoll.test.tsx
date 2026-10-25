// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { PianoRoll } from "#webui/components/gen/PianoRoll";

const notes = [
  { p: 60, t: 0, d: 1, v: 100 },
  { p: 67, t: 5, d: 2, v: 20 },
];

describe("PianoRoll", () => {
  it("says so when there are no notes", () => {
    render(<PianoRoll notes={[]} />);

    expect(screen.getByText("No notes")).toBeTruthy();
  });

  it("draws a rectangle per note, stretched to the clip length when it is longer", () => {
    const { container } = render(<PianoRoll notes={notes} lengthBeats={16} />);

    expect(container.querySelectorAll("rect[data-note]")).toHaveLength(2);
    expect(container.querySelectorAll("line")).toHaveLength(5);
  });

  it("makes do with the notes when the length isn't known", () => {
    const { container } = render(<PianoRoll notes={notes} />);

    // The last note ends at beat 7: two bars.
    expect(container.querySelectorAll("line")).toHaveLength(3);
  });

  it("shades louder notes brighter", () => {
    const { container } = render(<PianoRoll notes={notes} />);
    const [quiet, loud] = [67, 60].map((p) =>
      Number(
        container
          .querySelector(`rect[data-note="${p}"]`)
          ?.getAttribute("opacity"),
      ),
    );

    expect(quiet).toBeLessThan(loud ?? 0);
  });
});
