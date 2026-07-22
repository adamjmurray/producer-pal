// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { DriftNote } from "#webui/components/context/editor/DriftNote";

describe("DriftNote", () => {
  it("renders nothing when the override is not drifted", () => {
    const { container } = render(
      <DriftNote drifted={false} forkedFromVersion="1.5.0" />,
    );

    expect(container.textContent).toBe("");
  });

  it("names the fork-time version when drifted", () => {
    render(<DriftNote drifted={true} forkedFromVersion="1.4.0" />);

    expect(
      screen.getByText(/Default changed since you forked \(v1\.4\.0\)\./),
    ).toBeTruthy();
  });

  it("omits the version parenthetical when the fork version is unknown", () => {
    render(<DriftNote drifted={true} forkedFromVersion={null} />);

    const note = screen.getByText(/Default changed since you forked\./);

    expect(note.textContent).not.toContain("(v");
  });
});
