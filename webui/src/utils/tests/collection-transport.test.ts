// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOC_REQUEST_TIMEOUT_MS } from "#webui/lib/constants/transport";
import {
  deleteEntryRequest,
  fetchEntries,
  putEntry,
  putRename,
} from "#webui/utils/collection-transport";

const URL = "http://localhost/api/memory/prefers-c-minor";
const LIST_URL = "http://localhost/api/memory";

/** One collection write, so the deadline tests can run all three channels. */
interface WriteChannel {
  name: string;
  dispatch: () => Promise<unknown>;
}

const CHANNELS: WriteChannel[] = [
  {
    name: "putEntry",
    dispatch: () => putEntry(URL, { content: "x" }, false, "Memory"),
  },
  {
    name: "putRename",
    dispatch: () => putRename(URL, "new-slug", {}, "Memory"),
  },
  {
    name: "deleteEntryRequest",
    dispatch: () => deleteEntryRequest(URL, "Memory"),
  },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Stub fetch as a request the server accepts and never answers — it settles only
 * when the transport's own deadline aborts its signal, the way a real fetch does.
 */
function stubUnanswered(): void {
  fetchMock.mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      }),
  );
}

/**
 * How a write settled, as a value — the assertion has to come after the timer
 * advance that settles it, which a `rejects` matcher can't express.
 * @param write - The dispatched write
 * @returns Its resolved value, or the error it threw
 */
function settlementOf(write: Promise<unknown>): Promise<unknown> {
  return write.then(
    (value) => value,
    (error: unknown) => error,
  );
}

/**
 * A 200 JSON response.
 * @param body - Response body serialized as JSON
 * @returns A Response instance
 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("collection transport write deadline", () => {
  for (const channel of CHANNELS) {
    it(`fails a ${channel.name} the server never answers`, async () => {
      stubUnanswered();

      const outcome = settlementOf(channel.dispatch());

      await vi.advanceTimersByTimeAsync(DOC_REQUEST_TIMEOUT_MS);

      expect(await outcome).toHaveProperty(
        "message",
        "Memory update timed out",
      );
    });
  }

  it("keeps waiting right up to the deadline", async () => {
    stubUnanswered();

    let settled = false;

    void putEntry(URL, {}, false, "Memory").catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(DOC_REQUEST_TIMEOUT_MS - 1);

    expect(settled).toBe(false);
  });

  it("times out a response whose body never arrives", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      } as unknown as Response),
    );

    const outcome = settlementOf(putEntry(URL, {}, false, "Memory"));

    await vi.advanceTimersByTimeAsync(DOC_REQUEST_TIMEOUT_MS);

    expect(await outcome).toHaveProperty("message", "Memory update timed out");
  });

  it("leaves a write that lands in time alone", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ entry: { name: "new-slug" } }));

    await expect(
      putRename(URL, "New Slug", {}, "Memory"),
    ).resolves.toStrictEqual({ name: "new-slug" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // The unload flush still depends on keepalive; the deadline is added to it.
    expect(init.keepalive).toBe(true);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("still reports the server's own error over the deadline's", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "body must not be empty" }), {
        status: 400,
        statusText: "Bad Request",
      }),
    );

    await expect(deleteEntryRequest(URL, "Memory")).rejects.toThrow(
      "body must not be empty",
    );
  });

  // The list read gets the same deadline: without one, a GET the server never
  // answers leaves the collection screen on "Loading…" with nothing to retry.
  it("fails a list read the server never answers", async () => {
    stubUnanswered();

    const outcome = settlementOf(fetchEntries(LIST_URL, "Memory"));

    await vi.advanceTimersByTimeAsync(DOC_REQUEST_TIMEOUT_MS);

    expect(await outcome).toHaveProperty("message", "Memory request timed out");
  });

  it("leaves a list read that lands in time alone", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ entries: [{ name: "a" }] }));

    await expect(fetchEntries(LIST_URL, "Memory")).resolves.toStrictEqual([
      { name: "a" },
    ]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // The read stays a plain no-store GET — no keepalive, which is a write-only
    // concern (the unload flush).
    expect(init.cache).toBe("no-store");
    expect(init.keepalive).toBeUndefined();
    expect(init.signal?.aborted).toBe(false);
  });
});
