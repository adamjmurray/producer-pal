// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ContextApp } from "#webui/components/context/ContextApp";

vi.mock(import("#webui/components/context/ContextScreen"), () => ({
  ContextScreen: () => <div data-testid="context-screen" />,
}));

vi.mock(import("#webui/hooks/theme/use-theme"), () => ({
  useTheme: () => ({ theme: "system", setTheme: () => {} }),
}));

describe("ContextApp", () => {
  it("renders the ContextScreen", () => {
    render(<ContextApp />);

    expect(screen.getByTestId("context-screen")).toBeTruthy();
  });
});
