// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { SmallModelIndicator } from "#webui/components/chat/controls/header/SmallModelIndicator";

describe("SmallModelIndicator", () => {
  it("names the current default in the locked title, both ways round", () => {
    const { unmount } = render(
      <SmallModelIndicator active={false} diverges={true} />,
    );

    expect(screen.getByLabelText("large model").parentElement?.title).toBe(
      "Locked: large model mode (default is now small model mode)",
    );
    unmount();

    render(<SmallModelIndicator active={true} diverges={true} />);

    expect(screen.getByLabelText("small model").parentElement?.title).toBe(
      "Locked: small model mode (default is now large model mode)",
    );
  });

  it("carries no title when the conversation matches the default", () => {
    render(<SmallModelIndicator active={true} />);

    expect(screen.getByLabelText("small model").parentElement?.title).toBe("");
  });
});
