// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ClipWidget, type LiveChange } from "#src/shared/gen-ui-types";
import { ClipWidgetCard } from "#webui/components/gen/ClipWidgetCard";
import { type LiveTick } from "#webui/hooks/connection/use-gen-ui-stream";

const widget: ClipWidget = { id: "w1", kind: "clip", ref: "t0/s0" };

const clipReply = (notes: string, name = "Bass"): object => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      isError: false,
      result: {
        id: "12",
        path: "t0/s0",
        name,
        type: "midi",
        length: "1bar",
        notes,
      },
    }),
});

const goneReply = {
  ok: true,
  status: 200,
  json: () => Promise.resolve({ isError: true, result: "no clip at t0/s0" }),
};

const tick = (seq: number, change: Partial<LiveChange>): LiveTick => ({
  seq,
  change: {
    tool: "ppal-update-clip",
    ids: [],
    paths: [],
    all: false,
    ...change,
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClipWidgetCard", () => {
  it("shows the clip's name, length and notes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(clipReply("[{p:60,t:0,d:1,v:100},{p:64,t:1,d:1}]")),
    );

    const { container } = render(
      <ClipWidgetCard widget={widget} live={null} />,
    );

    expect(await screen.findByText("Bass")).toBeTruthy();
    expect(screen.getByText(/1bar · 2 notes/)).toBeTruthy();
    expect(container.querySelectorAll("rect[data-note]")).toHaveLength(2);
  });

  it("re-reads when a tick names its clip, and not for another", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(clipReply("[{p:60,t:0,d:1}]"))
      .mockResolvedValueOnce(
        clipReply("[{p:60,t:0,d:1},{p:62,t:1,d:1}]", "Bass v2"),
      );

    vi.stubGlobal("fetch", fetchMock);

    const { rerender, container } = render(
      <ClipWidgetCard widget={widget} live={null} />,
    );

    await screen.findByText("Bass");

    rerender(
      <ClipWidgetCard widget={widget} live={tick(1, { ids: ["99"] })} />,
    );
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The widget points at a path; the tool named the clip by the id the
    // first read found.
    rerender(
      <ClipWidgetCard widget={widget} live={tick(2, { ids: ["12"] })} />,
    );

    expect(await screen.findByText("Bass v2")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("rect[data-note]")).toHaveLength(2);
  });

  it("shows a deleted clip as missing, not as what it held", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(clipReply("[{p:60,t:0,d:1}]"))
      .mockResolvedValueOnce(goneReply);

    vi.stubGlobal("fetch", fetchMock);

    const { rerender, container } = render(
      <ClipWidgetCard widget={widget} live={null} />,
    );

    await screen.findByText("Bass");
    rerender(<ClipWidgetCard widget={widget} live={tick(1, { all: true })} />);

    expect(
      await screen.findByText(/Clip missing: no clip at t0\/s0/),
    ).toBeTruthy();
    expect(screen.queryByText("Bass")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows a clip that was never there as missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(goneReply));

    render(<ClipWidgetCard widget={widget} live={null} />);

    expect(await screen.findByText(/Clip missing/)).toBeTruthy();
  });

  it("shows a server failure as an error, with no clip data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    render(<ClipWidgetCard widget={widget} live={null} />);

    expect(await screen.findByText("Can't reach the server")).toBeTruthy();
  });

  it("ignores ticks that arrived before it mounted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(clipReply("[]"));

    vi.stubGlobal("fetch", fetchMock);
    render(<ClipWidgetCard widget={widget} live={tick(7, { all: true })} />);

    await waitFor(() => expect(screen.getByText(/No notes/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ClipWidgetCard details", () => {
  it("titles itself from the widget when it has a title, else from the clip, else from the ref", async () => {
    const fetchMock = vi.fn().mockResolvedValue(clipReply("[]", "Clip name"));

    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <ClipWidgetCard widget={{ ...widget, title: "My bass" }} live={null} />,
    );

    expect(await screen.findByText("My bass")).toBeTruthy();
    expect(screen.queryByText("Clip name")).toBeNull();

    rerender(<ClipWidgetCard widget={widget} live={null} />);

    expect(await screen.findByText("Clip name")).toBeTruthy();
  });

  it("names the ref while it loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined)),
    );
    render(<ClipWidgetCard widget={widget} live={null} />);

    expect(screen.getByText("Clip t0/s0")).toBeTruthy();
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("describes an audio clip with no length or path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            result: { id: "5", type: "audio" },
            isError: false,
          }),
      }),
    );

    const { container } = render(
      <ClipWidgetCard widget={widget} live={null} />,
    );

    expect(await screen.findByText("Audio clip")).toBeTruthy();
    expect(screen.getByText(/audio · \? · 0 notes/)).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws a MIDI clip whose length isn't whole bars from its notes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            isError: false,
            result: {
              id: "5",
              type: "midi",
              length: "1bar+n/8",
              notes: "[{p:60,t:0,d:1}]",
            },
          }),
      }),
    );

    const { container } = render(
      <ClipWidgetCard widget={widget} live={null} />,
    );

    await waitFor(() =>
      expect(container.querySelectorAll("rect[data-note]")).toHaveLength(1),
    );
  });

  it("re-reads on a tick that arrives while the clip is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(goneReply)
      .mockResolvedValueOnce(clipReply("[{p:60,t:0,d:1}]"));

    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<ClipWidgetCard widget={widget} live={null} />);

    await screen.findByText(/Clip missing/);
    rerender(<ClipWidgetCard widget={widget} live={tick(1, { all: true })} />);

    expect(await screen.findByText(/1 notes/)).toBeTruthy();
  });
});
