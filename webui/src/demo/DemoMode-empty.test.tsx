// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("./demo-fixtures"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, demoMessages: [] };
});

import { DemoMode } from "./DemoMode";

describe("DemoMode with no fixture messages", () => {
  it("renders an idle, empty message list", () => {
    render(<DemoMode />);
    expect(screen.getByText(/Demo Mode/)).toBeDefined();
    expect(screen.queryAllByTestId("assistant-message-bubble")).toHaveLength(0);
    expect(screen.queryByText(/using tool:/)).toBeNull();
  });
});
