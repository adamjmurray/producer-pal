// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
  useMemoryCollection,
} from "#webui/hooks/context/use-memory-collection";
import { deferred, jsonResponse } from "./doc-memory-transport-test-helpers";

// happy-dom origin is http://localhost:3000/, so the endpoints resolve there.
const LIST_URL = "http://localhost:3000/memory";
const ENTRY_URL = "http://localhost:3000/memory/prefers-c-minor";

let fetchMock: ReturnType<typeof vi.fn>;

/** A rendered hook's `result` handle. */
type HookResult = { current: UseMemoryCollectionReturn };

/**
 * Build a server memory record with overridable fields.
 * @param over - Fields to override on the default record
 * @returns A raw entry record as the server would return it
 */
function rawEntry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "prefers-c-minor",
    description: "default key & genre",
    body: "Composes in C minor.",
    ...over,
  };
}

/**
 * Mock the list GET, mount the hook, and wait for it to reach `ready`.
 * @param entries - The entries the initial list GET should return
 * @returns The rendered hook's `result` handle
 */
async function mountReady(entries: unknown[] = []): Promise<HookResult> {
  fetchMock.mockResolvedValueOnce(jsonResponse({ entries }));

  const { result } = renderHook(useMemoryCollection);

  await waitFor(() => {
    expect(result.current.status.kind).toBe("ready");
  });

  return result;
}

/**
 * The ready entries, asserting the status is ready first.
 * @param result - The rendered hook's `result` handle
 * @returns The current entries
 */
function readyEntries(result: HookResult): MemoryEntryView[] {
  const { status } = result.current;

  if (status.kind !== "ready") {
    throw new Error(`expected ready, got ${status.kind}`);
  }

  return status.entries;
}

/**
 * A 400 JSON Response carrying an optional `error` field.
 * @param body - The error body
 * @returns A 400 Response
 */
function badRequest(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 400,
    statusText: "Bad Request",
    headers: { "Content-Type": "application/json" },
  });
}

const SAMPLE_INPUT = {
  description: "default key & genre",
  content: "Composes in C minor.",
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMemoryCollection", () => {
  it("loads and maps all entries on mount via a no-store GET", async () => {
    const result = await mountReady([
      rawEntry(),
      rawEntry({ name: "loose-drums" }),
    ]);

    expect(readyEntries(result)).toStrictEqual([
      {
        name: "prefers-c-minor",
        description: "default key & genre",
        body: "Composes in C minor.",
      },
      {
        name: "loose-drums",
        description: "default key & genre",
        body: "Composes in C minor.",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(LIST_URL, { cache: "no-store" });
  });

  it("falls back to an empty list when entries is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const { result } = renderHook(useMemoryCollection);

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "ready",
        entries: [],
      });
    });
  });

  it("reports an error when the GET is not ok", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );

    const { result } = renderHook(useMemoryCollection);

    await waitFor(() => {
      expect(result.current.status.kind).toBe("error");
    });

    expect(
      result.current.status.kind === "error" && result.current.status.message,
    ).toContain("Memory request failed");
  });

  it("stringifies a non-Error rejection", async () => {
    fetchMock.mockRejectedValueOnce("plain string error");

    const { result } = renderHook(useMemoryCollection);

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "error",
        message: "plain string error",
      });
    });
  });

  it("saveEntry PUTs the input and appends a new entry", async () => {
    const result = await mountReady([]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: rawEntry() }));

    let saved: unknown;

    await act(async () => {
      saved = await result.current.saveEntry("prefers-c-minor", SAMPLE_INPUT);
    });

    expect(saved).toMatchObject({ name: "prefers-c-minor" });
    expect(readyEntries(result)).toHaveLength(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      ENTRY_URL,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(SAMPLE_INPUT),
      }),
    );
  });

  it("saveEntry replaces an existing entry in place", async () => {
    const result = await mountReady([rawEntry({ body: "old" })]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ entry: rawEntry({ body: "new" }) }),
    );

    await act(async () => {
      await result.current.saveEntry("prefers-c-minor", {
        ...SAMPLE_INPUT,
        content: "new",
      });
    });

    const entries = readyEntries(result);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.body).toBe("new");
  });

  it("saveEntry surfaces the server's error message on a failed write", async () => {
    const result = await mountReady([]);

    fetchMock.mockResolvedValueOnce(
      badRequest({ error: "Memory body must not be empty" }),
    );

    let saved: unknown;

    await act(async () => {
      saved = await result.current.saveEntry("x", {
        ...SAMPLE_INPUT,
        content: "   ",
      });
    });

    expect(saved).toBeNull();
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toBe("Memory body must not be empty");
  });

  it("saveEntry falls back to a status line when the error body is unparseable", async () => {
    const result = await mountReady([]);

    fetchMock.mockResolvedValueOnce(
      new Response("not json", { status: 500, statusText: "Server Error" }),
    );

    await act(async () => {
      await result.current.saveEntry("x", { ...SAMPLE_INPUT, content: "y" });
    });

    expect(result.current.saveError).toContain("Memory update failed");
  });

  it("falls back to a status line when the error JSON lacks an error field", async () => {
    const result = await mountReady([]);

    // 400 with parseable JSON that has no `error` field → generic fallback.
    fetchMock.mockResolvedValueOnce(badRequest({ nope: true }));

    await act(async () => {
      await result.current.saveEntry("x", { ...SAMPLE_INPUT, content: "y" });
    });

    expect(result.current.saveError).toContain("Memory update failed");
  });

  it("renameEntry PUTs to the rename endpoint and swaps the entry in the list", async () => {
    const result = await mountReady([rawEntry()]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ entry: rawEntry({ name: "renamed" }) }),
    );

    let renamed: unknown;

    await act(async () => {
      renamed = await result.current.renameEntry(
        "prefers-c-minor",
        "Renamed",
        SAMPLE_INPUT,
      );
    });

    expect(renamed).toMatchObject({ name: "renamed" });
    expect(readyEntries(result).map((e) => e.name)).toStrictEqual(["renamed"]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${ENTRY_URL}/rename`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ ...SAMPLE_INPUT, newName: "Renamed" }),
      }),
    );
  });

  it("renameEntry updates in place on a no-op slug change", async () => {
    const result = await mountReady([rawEntry({ body: "old" })]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ entry: rawEntry({ body: "kept" }) }),
    );

    await act(async () => {
      await result.current.renameEntry("prefers-c-minor", "Prefers C Minor", {
        ...SAMPLE_INPUT,
        content: "kept",
      });
    });

    const entries = readyEntries(result);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.body).toBe("kept");
  });

  it("renameEntry returns null and surfaces the server error on a collision", async () => {
    const result = await mountReady([rawEntry()]);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'A memory named "taken" already exists' }),
        {
          status: 409,
          statusText: "Conflict",
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    let renamed: unknown;

    await act(async () => {
      renamed = await result.current.renameEntry(
        "prefers-c-minor",
        "taken",
        SAMPLE_INPUT,
      );
    });

    expect(renamed).toBeNull();
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toMatch(/already exists/i);
    // The original entry is left untouched.
    expect(readyEntries(result).map((e) => e.name)).toStrictEqual([
      "prefers-c-minor",
    ]);
  });

  it("resetSaveStatus clears a prior save outcome back to idle", async () => {
    const result = await mountReady([]);

    // Drive it into an error state, then reset.
    fetchMock.mockResolvedValueOnce(badRequest({ error: "nope" }));

    await act(async () => {
      await result.current.saveEntry("x", { ...SAMPLE_INPUT, content: "y" });
    });

    expect(result.current.saveStatus).toBe("error");

    await act(async () => {
      result.current.resetSaveStatus();
    });

    expect(result.current.saveStatus).toBe("idle");
    expect(result.current.saveError).toBeNull();
  });

  it("does not paint 'saved' for a save that resolved after the edited entry changed", async () => {
    // Cross-entry leak: switching entries mid-save reset the shared indicator,
    // then the prior entry's late echo flipped it back to "saved" — surfacing
    // as the newly-selected entry's status. resetSaveStatus advances a
    // generation the resolution checks, so the outcome is entry-scoped.
    const result = await mountReady([rawEntry()]);

    const put = deferred<Response>();

    fetchMock.mockReturnValueOnce(put.promise);

    await act(async () => {
      const saving = result.current.saveEntry("prefers-c-minor", SAMPLE_INPUT);

      // The user switches to another entry while the PUT is in flight.
      result.current.resetSaveStatus();
      put.resolve(jsonResponse({ entry: rawEntry() }));
      await saving;
    });

    // The save still merged into the list, but its "saved" must not surface.
    expect(result.current.saveStatus).toBe("idle");
    expect(readyEntries(result)).toHaveLength(1);
  });

  it("does not paint 'error' for a failed save that resolved after the edited entry changed", async () => {
    const result = await mountReady([rawEntry()]);

    const put = deferred<Response>();

    fetchMock.mockReturnValueOnce(put.promise);

    await act(async () => {
      const saving = result.current.saveEntry("prefers-c-minor", SAMPLE_INPUT);

      result.current.resetSaveStatus();
      put.resolve(badRequest({ error: "boom" }));
      await saving;
    });

    expect(result.current.saveStatus).toBe("idle");
    expect(result.current.saveError).toBeNull();
  });

  it("deleteEntry DELETEs and removes the entry", async () => {
    const result = await mountReady([rawEntry()]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ existed: true }));

    let ok: boolean | undefined;

    await act(async () => {
      ok = await result.current.deleteEntry("prefers-c-minor");
    });

    expect(ok).toBe(true);
    expect(readyEntries(result)).toStrictEqual([]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      ENTRY_URL,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("deleteEntry reports failure when the DELETE is not ok", async () => {
    const result = await mountReady([rawEntry()]);

    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 403, statusText: "Forbidden" }),
    );

    let ok: boolean | undefined;

    await act(async () => {
      ok = await result.current.deleteEntry("prefers-c-minor");
    });

    expect(ok).toBe(false);
    expect(result.current.saveStatus).toBe("error");
    // The entry is left in the list since the delete failed.
    expect(readyEntries(result)).toHaveLength(1);
  });

  it("leaves the status untouched when a write resolves before the load", async () => {
    // GET never resolves, so status is still "loading" when the write echoes.
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));

    const { result } = renderHook(useMemoryCollection);

    fetchMock.mockResolvedValueOnce(jsonResponse({ entry: rawEntry() }));

    await act(async () => {
      await result.current.saveEntry("prefers-c-minor", SAMPLE_INPUT);
    });

    expect(result.current.status.kind).toBe("loading");
  });

  it("leaves the status untouched when a delete resolves before the load", async () => {
    // GET never resolves, so status is still "loading" when the delete echoes.
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));

    const { result } = renderHook(useMemoryCollection);

    fetchMock.mockResolvedValueOnce(jsonResponse({ existed: true }));

    await act(async () => {
      await result.current.deleteEntry("prefers-c-minor");
    });

    expect(result.current.status.kind).toBe("loading");
  });

  it("re-fetches on window focus so external writes surface", async () => {
    const result = await mountReady([rawEntry({ body: "v1" })]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ entries: [rawEntry({ body: "v2" })] }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(readyEntries(result)[0]?.body).toBe("v2");
    });
  });

  it("drops a refresh that a concurrent save superseded", async () => {
    const result = await mountReady([rawEntry({ body: "loaded" })]);

    const putEcho = deferred<Response>();
    const staleGet = deferred<Response>();

    fetchMock.mockReturnValueOnce(putEcho.promise); // save PUT
    fetchMock.mockReturnValueOnce(staleGet.promise); // refresh GET (pre-save read)

    await act(async () => {
      const savePromise = result.current.saveEntry("prefers-c-minor", {
        ...SAMPLE_INPUT,
        content: "MINE",
      });
      const refreshPromise = result.current.refresh();

      // The save echo lands first and sets the body.
      putEcho.resolve(jsonResponse({ entry: rawEntry({ body: "MINE" }) }));
      await savePromise;

      // The stale GET resolves last; the overlap guard must drop it.
      staleGet.resolve(
        jsonResponse({ entries: [rawEntry({ body: "stale" })] }),
      );
      await refreshPromise;
    });

    expect(readyEntries(result)[0]?.body).toBe("MINE");
  });
});
