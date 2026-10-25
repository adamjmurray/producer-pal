// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type GenUiEvent, type Widget } from "#src/shared/gen-ui-types";
import { useGenUiStream } from "#webui/hooks/connection/use-gen-ui-stream";

class FakeSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  closed = false;

  close(): void {
    this.closed = true;
  }

  send(event: GenUiEvent): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

const text = (id: string): Widget => ({ id, kind: "text", text: id });

const snapshot = (version: number, widgets: Widget[] = []): GenUiEvent => ({
  type: "snapshot",
  epoch: "e1",
  version,
  widgets,
});

/**
 * Answer GET /api/ui/widgets with a snapshot (or a status).
 * @param body - The snapshot the server returns, or a status for a refusal
 */
function stubSnapshot(body: GenUiEvent | number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      typeof body === "number"
        ? Promise.resolve({ ok: false, status: body })
        : Promise.resolve({
            ok: true,
            json: () => {
              const { type: _type, ...rest } = body;

              return Promise.resolve(rest);
            },
          }),
    ),
  );
}

/**
 * Mount the hook with a fake event source.
 * @returns The hook result and the sources it opened
 */
function mountStream(): {
  result: ReturnType<
    typeof renderHook<ReturnType<typeof useGenUiStream>, void>
  >["result"];
  sources: FakeSource[];
} {
  const sources: FakeSource[] = [];

  const open = (): EventSource => {
    const source = new FakeSource();

    sources.push(source);

    return source as unknown as EventSource;
  };

  const { result } = renderHook(() => useGenUiStream(open));

  return { result, sources };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGenUiStream", () => {
  it("reports an unavailable feature without opening a stream", async () => {
    stubSnapshot(404);

    const { result, sources } = mountStream();

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(sources).toHaveLength(0);
  });

  it("starts from the snapshot, then follows the stream", async () => {
    stubSnapshot(snapshot(2, [text("w1")]));

    const { result, sources } = mountStream();

    await waitFor(() => expect(sources).toHaveLength(1));
    expect(result.current.widgets.map((w) => w.id)).toStrictEqual(["w1"]);

    const source = sources[0] as FakeSource;

    await act(() => {
      source.onopen?.();
      source.send(snapshot(2, [text("w1")]));
      source.send({
        type: "widget",
        version: 3,
        change: { op: "upsert", widget: text("w2") },
      });
    });

    expect(result.current.status).toBe("live");
    expect(result.current.widgets.map((w) => w.id)).toStrictEqual(["w1", "w2"]);
    // Nothing was missed, so the clips have nothing to re-read.
    expect(result.current.live).toBeNull();
  });

  it("ticks the clips on a Live change", async () => {
    stubSnapshot(snapshot(0));

    const { result, sources } = mountStream();

    await waitFor(() => expect(sources).toHaveLength(1));
    await act(() => {
      (sources[0] as FakeSource).send({
        type: "live",
        version: 1,
        tool: "ppal-create-clip",
        ids: ["12"],
        paths: ["t0/s0"],
        all: false,
      });
    });

    expect(result.current.live).toStrictEqual({
      seq: 1,
      change: {
        type: "live",
        version: 1,
        tool: "ppal-create-clip",
        ids: ["12"],
        paths: ["t0/s0"],
        all: false,
      },
    });
  });

  it("reloads the snapshot when a version is missed, and re-reads every clip", async () => {
    stubSnapshot(snapshot(0));

    const { result, sources } = mountStream();

    await waitFor(() => expect(sources).toHaveLength(1));

    // The server moved on while an event was lost.
    stubSnapshot(snapshot(5, [text("w9")]));

    await act(() => {
      (sources[0] as FakeSource).send({
        type: "live",
        version: 3,
        tool: "x",
        ids: [],
        paths: [],
        all: false,
      });
    });

    await waitFor(() =>
      expect(result.current.widgets.map((w) => w.id)).toStrictEqual(["w9"]),
    );
    expect(result.current.live?.change.all).toBe(true);
  });

  it("re-reads every clip when the stream reconnects after a gap", async () => {
    stubSnapshot(snapshot(1));

    const { result, sources } = mountStream();

    await waitFor(() => expect(sources).toHaveLength(1));
    await act(() => {
      // The browser reconnected; the server's snapshot is ahead of what we saw.
      (sources[0] as FakeSource).send(snapshot(4, [text("w1")]));
    });

    expect(result.current.widgets).toHaveLength(1);
    expect(result.current.live?.change.all).toBe(true);
  });

  it("ignores a garbled event and closes the stream on unmount", async () => {
    stubSnapshot(snapshot(0));

    const { result, sources } = mountStream();

    await waitFor(() => expect(sources).toHaveLength(1));

    const source = sources[0] as FakeSource;

    await act(() => {
      source.onmessage?.({ data: "{not json" });
      source.onerror?.();
    });

    expect(result.current.status).toBe("connecting");
    expect(result.current.widgets).toStrictEqual([]);
  });
});

/**
 * A promise settled from outside, to hold a fetch open.
 * @returns The promise and its resolver
 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

/**
 * Answer the first fetch with a snapshot, then every later one with `later`.
 * @param first - The snapshot for the first fetch
 * @param later - What each later fetch returns
 * @returns The fetch mock
 */
function stubSnapshotThen(
  first: GenUiEvent,
  later: () => Promise<unknown>,
): ReturnType<typeof vi.fn> {
  const { type: _type, ...rest } = first as Extract<
    GenUiEvent,
    { type: "snapshot" }
  >;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rest) })
    .mockImplementation(later);

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

const gap = (version: number): GenUiEvent => ({
  type: "widget",
  version,
  change: { op: "remove", id: "w1" },
});

describe("useGenUiStream when the server misbehaves", () => {
  it("reports an unreachable server as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    const { result, sources } = mountStream();

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(sources).toHaveLength(0);
  });

  it("opens no stream if it unmounts before the first snapshot arrives", async () => {
    const pending = deferred<unknown>();

    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));

    const sources: FakeSource[] = [];
    const { unmount } = renderHook(() =>
      useGenUiStream(() => {
        const source = new FakeSource();

        sources.push(source);

        return source as unknown as EventSource;
      }),
    );

    unmount();
    pending.resolve({
      ok: true,
      json: () => Promise.resolve({ epoch: "e1", version: 0, widgets: [] }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(sources).toHaveLength(0);
  });

  it("asks for the snapshot once however many events it misses meanwhile", async () => {
    const reload = deferred<unknown>();
    const fetchMock = stubSnapshotThen(
      snapshot(0, [text("w1")]),
      () => reload.promise,
    );
    const { result, sources } = mountStream();

    await waitFor(() => expect(sources).toHaveLength(1));
    await act(() => {
      (sources[0] as FakeSource).send(gap(5));
      (sources[0] as FakeSource).send(gap(6));
    });

    // The first fetch, plus one reload.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    reload.resolve({
      ok: true,
      json: () =>
        Promise.resolve({ epoch: "e1", version: 6, widgets: [text("w9")] }),
    });
    await waitFor(() =>
      expect(result.current.widgets.map((w) => w.id)).toStrictEqual(["w9"]),
    );
  });

  it("keeps what it has when the reload fails", async () => {
    stubSnapshotThen(snapshot(0, [text("w1")]), () =>
      Promise.resolve({ ok: false, status: 500 }),
    );

    const { result, sources } = mountStream();

    await waitFor(() => expect(sources).toHaveLength(1));
    await act(() => {
      (sources[0] as FakeSource).send(gap(5));
    });
    await act(() => Promise.resolve());

    expect(result.current.widgets.map((w) => w.id)).toStrictEqual(["w1"]);
  });

  it("drops a reload that arrives after it unmounted", async () => {
    const reload = deferred<unknown>();

    stubSnapshotThen(snapshot(0, [text("w1")]), () => reload.promise);

    const sources: FakeSource[] = [];
    const { result, unmount } = renderHook(() =>
      useGenUiStream(() => {
        const source = new FakeSource();

        sources.push(source);

        return source as unknown as EventSource;
      }),
    );

    await waitFor(() => expect(sources).toHaveLength(1));
    await act(() => {
      (sources[0] as FakeSource).send(gap(5));
    });
    unmount();
    reload.resolve({
      ok: true,
      json: () =>
        Promise.resolve({ epoch: "e1", version: 5, widgets: [text("w9")] }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.widgets.map((w) => w.id)).toStrictEqual(["w1"]);
    expect((sources[0] as FakeSource).closed).toBe(true);
  });
});
