// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenLayout } from "#webui/components/gen/GenLayout";

vi.mock(import("#webui/components/App"), () => ({
  App: () => <div>chat</div>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GenLayout", () => {
  it("puts the widget panel beside the chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    render(<GenLayout />);

    expect(screen.getByText("chat")).toBeTruthy();
    expect(screen.getByText("Generative UI")).toBeTruthy();
    expect(await screen.findByText(/Not available in this build/)).toBeTruthy();
  });
});
