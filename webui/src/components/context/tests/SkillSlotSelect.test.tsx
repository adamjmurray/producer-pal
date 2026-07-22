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
  it("glyph-marks drifted, customized, and tracking slots", () => {
    const slots = [
      slot({ name: "a", title: "Tracking", override: "" }),
      slot({ name: "b", title: "Customized", override: "MINE" }),
      slot({ name: "c", title: "Drifted", override: "MINE", drifted: true }),
    ];

    render(<SkillSlotSelect slots={slots} selected="a" onSelect={vi.fn()} />);

    const options = screen.getAllByRole("option");

    expect(options[0]?.textContent).toBe("Tracking");
    expect(options[1]?.textContent).toBe("✎ Customized");
    expect(options[2]?.textContent).toBe("⚠ Drifted");
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
