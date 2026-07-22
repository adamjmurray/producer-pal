// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextApp } from "#webui/components/context/ContextApp";

vi.mock(import("#webui/components/context/ContextTabs"), () => ({
  ContextTabs: (props: { onClose?: () => void } = {}) => (
    <div data-testid="context-tabs">
      {props.onClose && (
        <button data-testid="close-button" onClick={props.onClose}>
          Close
        </button>
      )}
    </div>
  ),
}));

vi.mock(import("#webui/hooks/theme/use-theme"), () => ({
  useTheme: () => ({ theme: "system", setTheme: () => {} }),
}));

describe("ContextApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the ContextTabs", () => {
    render(<ContextApp />);

    expect(screen.getByTestId("context-tabs")).toBeTruthy();
  });

  it("close navigates to /", () => {
    const assign = vi.fn();

    vi.stubGlobal("location", { assign });

    render(<ContextApp />);
    screen.getByTestId("close-button").click();

    expect(assign).toHaveBeenCalledWith("/");
  });
});
