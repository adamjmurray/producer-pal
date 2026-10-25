// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenPanel } from "#webui/components/gen/GenPanel";

class QuietSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  close(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GenPanel", () => {
  it("says so when the build doesn't have the feature", async () => {
    vi.stubGlobal("EventSource", QuietSource);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    render(<GenPanel />);

    expect(await screen.findByText(/Not available in this build/)).toBeTruthy();
  });

  it("says when there is nothing to show yet", async () => {
    vi.stubGlobal("EventSource", QuietSource);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            epoch: "e",
            version: 0,
            widgets: [],
            sync: {
              mode: "writes-only",
              detail: "Clips refresh after AI changes only (no script).",
            },
          }),
      }),
    );

    render(<GenPanel />);

    expect(await screen.findByText(/No widgets yet/)).toBeTruthy();
    expect(screen.getByTestId("gen-sync").textContent).toBe(
      "Clips refresh after AI changes only (no script).",
    );
  });

  it("draws a text widget and a clip widget", async () => {
    vi.stubGlobal("EventSource", QuietSource);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              url.includes("/api/ui/widgets")
                ? {
                    epoch: "e",
                    version: 2,
                    sync: { mode: "listening", detail: "Watching clips." },
                    widgets: [
                      { id: "w1", kind: "text", text: "Try a fill" },
                      { id: "w2", kind: "clip", ref: "t0/s0" },
                    ],
                  }
                : { isError: true, result: "no clip at t0/s0" },
            ),
        }),
      ),
    );

    render(<GenPanel />);

    expect(await screen.findByText("Try a fill")).toBeTruthy();
    expect(await screen.findByText(/Clip missing/)).toBeTruthy();
  });
});
