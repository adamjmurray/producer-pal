// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { SkillSlotSelect } from "#webui/components/context/skills/SkillSlotSelect";
import { slot } from "./skill-slot-test-helpers";

describe("SkillSlotSelect", () => {
  it("labels options by filename and glyph-marks drifted, customized, and tracking slots", () => {
    const slots = [
      slot({ name: "arrangement", title: "Tracking", override: "" }),
      slot({ name: "devices", title: "Customized", override: "MINE" }),
      slot({
        name: "library",
        title: "Drifted",
        override: "MINE",
        drifted: true,
      }),
    ];

    render(
      <SkillSlotSelect
        slots={slots}
        selected="arrangement"
        onSelect={vi.fn()}
      />,
    );

    const options = screen.getAllByRole("option");

    // The filename is what an @include line names, so that is what is listed.
    expect(options[0]?.textContent).toBe("arrangement.md");
    expect(options[1]?.textContent).toBe("✎ devices.md");
    expect(options[2]?.textContent).toBe("⚠ library.md");
  });

  it("marks an override that predates a -write split with the same warning glyph", () => {
    // Drift and split-staleness both mean "this override wants a look", so they
    // share the glyph rather than teaching a second symbol.
    const slots = [
      slot({
        name: "barbeat-standard",
        override: "MINE",
        splitStale: { sibling: "barbeat-standard-write", sharedLines: 4 },
      }),
    ];

    render(
      <SkillSlotSelect
        slots={slots}
        selected="barbeat-standard"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("option").textContent).toBe(
      "⚠ barbeat-standard.md",
    );
  });

  it("keeps the human title reachable as each option's tooltip", () => {
    const slots = [slot({ name: "basic", title: "Full skills (small-model)" })];

    render(
      <SkillSlotSelect slots={slots} selected="basic" onSelect={vi.fn()} />,
    );

    expect(screen.getByRole("option").getAttribute("title")).toBe(
      "Full skills (small-model)",
    );
  });

  it("calls onSelect with the chosen slot name", () => {
    const onSelect = vi.fn();
    const slots = [
      slot({ name: "a", title: "A" }),
      slot({ name: "b", title: "B" }),
    ];

    render(<SkillSlotSelect slots={slots} selected="a" onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText("Skill fragment"), {
      target: { value: "b" },
    });

    expect(onSelect).toHaveBeenCalledWith("b");
  });
});
