// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { SkillGateNote } from "#webui/components/context/skills/SkillGateNote";

describe("SkillGateNote", () => {
  it("names the tools that keep the fragment", () => {
    render(<SkillGateNote gate={["ppal-read-clip", "ppal-create-clip"]} />);

    // "Dropped unless", not "included when": the gate is a necessary condition,
    // and a notation head also depends on the notation and the model depth.
    expect(screen.getByText(/Dropped unless/)).toBeTruthy();
    expect(screen.getByText("ppal-read-clip, ppal-create-clip")).toBeTruthy();
  });

  it("says so when no toolset can drop the fragment", () => {
    render(<SkillGateNote gate="always" />);

    expect(screen.getByText(/Never dropped/)).toBeTruthy();
  });

  it("says a conversation-only fragment never reaches a subagent", () => {
    render(<SkillGateNote gate="conversation-only" />);

    expect(screen.getByText(/never sent to a subagent/)).toBeTruthy();
  });

  it("renders nothing for a driver, which has no gate to state", () => {
    const { container } = render(<SkillGateNote gate={null} />);

    expect(container.textContent).toBe("");
  });
});
