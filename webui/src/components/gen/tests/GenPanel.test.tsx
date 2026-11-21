// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenPanel } from "#webui/components/gen/GenPanel";
import {
  PREVIEW_APP_SOURCE_EVENT,
  PREVIEW_APP_SOURCE_KEY,
} from "#webui/lib/utils/gen-ui/preview-app-source";

class QuietSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  close(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const EMPTY_SNAPSHOT = {
  epoch: "e",
  version: 0,
  widgets: [],
  sync: { mode: "writes-only", detail: "" },
};

function stubEmptySnapshot(detail = ""): void {
  vi.stubGlobal("EventSource", QuietSource);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...EMPTY_SNAPSHOT,
          sync: { mode: "writes-only", detail },
        }),
    }),
  );
}

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
    stubEmptySnapshot("Clips refresh after AI changes only (no script).");

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

  it("mounts a previewed app only once live, and keeps it through a reconnect", async () => {
    let answer: (response: unknown) => void = () => {};
    const sources: OpenSource[] = [];

    class OpenSource extends QuietSource {
      constructor() {
        super();
        sources.push(this);
        queueMicrotask(() => this.onopen?.());
      }
    }

    vi.stubGlobal("EventSource", OpenSource);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve))),
    );
    sessionStorage.setItem(PREVIEW_APP_SOURCE_KEY, "<p>my app</p>");

    render(<GenPanel />);

    // The widgets request hasn't answered: the build's support is unknown.
    expect(screen.getByTestId("gen-status").textContent).toBe("connecting");
    expect(screen.queryByTestId("gen-app-frame")).toBeNull();

    answer({ ok: true, json: () => Promise.resolve(EMPTY_SNAPSHOT) });

    const frame = await screen.findByTestId("gen-app-frame");

    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("<p>my app</p>");

    // A dropped connection must not restart the app.
    await act(() => sources[0]?.onerror?.());
    expect(screen.getByTestId("gen-status").textContent).toBe("connecting");
    expect(screen.getByTestId("gen-app-frame")).toBe(frame);
  });

  it("swaps the app when the stored source changes", async () => {
    stubEmptySnapshot();
    sessionStorage.setItem(PREVIEW_APP_SOURCE_KEY, "<p>one</p>");
    class OpenSource extends QuietSource {
      constructor() {
        super();
        queueMicrotask(() => this.onopen?.());
      }
    }
    vi.stubGlobal("EventSource", OpenSource);

    render(<GenPanel />);

    const frame = await screen.findByTestId("gen-app-frame");

    sessionStorage.setItem(PREVIEW_APP_SOURCE_KEY, "<p>two</p>");
    await act(() => {
      window.dispatchEvent(new Event(PREVIEW_APP_SOURCE_EVENT));
    });

    expect(screen.getByTestId("gen-app-frame")).toBe(frame);
    expect(frame.getAttribute("srcdoc")).toContain("<p>two</p>");
  });

  it("shows no app when none is set", async () => {
    stubEmptySnapshot();

    render(<GenPanel />);

    expect(await screen.findByText(/No widgets yet/)).toBeTruthy();
    expect(screen.queryByTestId("gen-app-frame")).toBeNull();
  });

  it("runs no app in a build without the feature", async () => {
    vi.stubGlobal("EventSource", QuietSource);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    sessionStorage.setItem(PREVIEW_APP_SOURCE_KEY, "<p>my app</p>");

    render(<GenPanel />);

    expect(await screen.findByText(/Not available in this build/)).toBeTruthy();
    expect(screen.queryByTestId("gen-app-frame")).toBeNull();
  });
});
