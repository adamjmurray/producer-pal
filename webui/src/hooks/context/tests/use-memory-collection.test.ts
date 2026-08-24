// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  type MemoryEntryView,
  type UseMemoryCollectionReturn,
  useMemoryCollection,
} from "#webui/hooks/context/use-memory-collection";
import {
  deferred,
  installFetchMock,
  jsonResponse,
  type RacedWrite,
  raceTwoWrites,
  renderAndWait,
} from "./doc-transport-test-helpers";
import {
  expectResetToIdle,
  landSaveBeforeStaleRefresh,
} from "./doc-collection-test-helpers";

// happy-dom origin is http://localhost:3000/, so the endpoints resolve there.
const LIST_URL = "http://localhost:3000/memory";
const ENTRY_URL = "http://localhost:3000/memory/prefers-c-minor";

const fetchMock = installFetchMock();

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

  return await renderAndWait(useMemoryCollection, "ready");
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

/**
 * Save a throwaway entry against whatever response is queued on fetchMock — the
 * setup shared by the save-failure paths.
 * @param result - The rendered hook's `result` handle
 */
async function saveSample(result: HookResult): Promise<void> {
  await act(async () => {
    await result.current.saveEntry("x", { ...SAMPLE_INPUT, content: "y" });
  });
}

/**
 * Save an entry whose PUT resolves only AFTER resetSaveStatus — i.e. the user
 * switched entries while the save was in flight, and the late echo must not
 * repaint the now-unrelated indicator.
 * @param result - The rendered hook's `result` handle
 * @param late - The response the in-flight PUT eventually resolves with
 */
async function saveResolvingAfterReset(
  result: HookResult,
  late: Response,
): Promise<void> {
  const put = deferred<Response>();

  fetchMock.mockReturnValueOnce(put.promise);

  await act(async () => {
    const saving = result.current.saveEntry("prefers-c-minor", SAMPLE_INPUT);

    // The user switches to another entry while the PUT is in flight.
    result.current.resetSaveStatus();
    put.resolve(late);
    await saving;
  });
}

/**
 * Save one entry's body through the collection hook.
 * @param result - The rendered hook's `result` handle
 * @param name - The entry to save
 * @param content - The body to store
 * @returns The saved entry, or null on failure
 */
function saveBody(
  result: HookResult,
  name: string,
  content: string,
): Promise<MemoryEntryView | null> {
  return result.current.saveEntry(name, { ...SAMPLE_INPUT, content });
}

/**
 * The older, slower write the same-entry race tests dispatch first: a save of
 * "prefers-c-minor" whose echo lands last and must not be committed.
 * @param result - The rendered hook's `result` handle
 * @returns The raced write descriptor
 */
function slowSaveOfSampleEntry(result: HookResult): RacedWrite {
  return {
    dispatch: () => saveBody(result, "prefers-c-minor", "OLD"),
    echo: jsonResponse({ entry: rawEntry({ body: "OLD" }) }),
  };
}

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
    expect(fetchMock).toHaveBeenCalledWith(
      LIST_URL,
      expect.objectContaining({ cache: "no-store" }),
    );
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

    const result = await renderAndWait(useMemoryCollection, "error");

    expect(
      result.current.status.kind === "error" && result.current.status.message,
    ).toContain("Memory request failed");
  });

  it("stringifies a non-Error rejection", async () => {
    fetchMock.mockRejectedValueOnce("plain string error");

    const result = await renderAndWait(useMemoryCollection, "error");

    expect(result.current.status).toStrictEqual({
      kind: "error",
      message: "plain string error",
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
        // keepalive so a beforeunload/unmount-flush save survives a tab close.
        keepalive: true,
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

    await saveSample(result);

    expect(result.current.saveError).toContain("Memory update failed");
  });

  it("falls back to a status line when the error JSON lacks an error field", async () => {
    const result = await mountReady([]);

    // 400 with parseable JSON that has no `error` field → generic fallback.
    fetchMock.mockResolvedValueOnce(badRequest({ nope: true }));

    await saveSample(result);

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

    expect(renamed).toMatchObject({ entry: { name: "renamed" }, error: null });
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

  it("renameEntry reports the server error on a collision, on its own result and on saveError", async () => {
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

    // The message rides back on the result too, so the caller can pin it: the
    // shared saveError is cleared by whatever writes next (after a rename that
    // is often the editor's resumed autosave, moments later).
    expect(renamed).toStrictEqual({
      entry: null,
      error: 'A memory named "taken" already exists',
    });
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

    await saveSample(result);

    expect(result.current.saveStatus).toBe("error");

    await expectResetToIdle(result);
  });

  it("does not paint 'saved' for a save that resolved after the edited entry changed", async () => {
    // Cross-entry leak: switching entries mid-save reset the shared indicator,
    // then the prior entry's late echo flipped it back to "saved" — surfacing
    // as the newly-selected entry's status. resetSaveStatus advances a
    // generation the resolution checks, so the outcome is entry-scoped.
    const result = await mountReady([rawEntry()]);

    await saveResolvingAfterReset(result, jsonResponse({ entry: rawEntry() }));

    // The save still merged into the list, but its "saved" must not surface.
    expect(result.current.saveStatus).toBe("idle");
    expect(readyEntries(result)).toHaveLength(1);
  });

  it("does not paint 'error' for a failed save that resolved after the edited entry changed", async () => {
    const result = await mountReady([rawEntry()]);

    await saveResolvingAfterReset(result, badRequest({ error: "boom" }));

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
      expect.objectContaining({ method: "DELETE", keepalive: true }),
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

  it("keeps the loaded entries when a later refresh fails", async () => {
    // Regression: refresh is also the 5s poll, and its error path replaced the
    // whole screen — unmounting the entry editor under it and taking an
    // unsaved draft with it. A failed tick now leaves the loaded list alone.
    const result = await mountReady([rawEntry({ body: "loaded" })]);

    fetchMock.mockResolvedValueOnce(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(readyEntries(result)[0]?.body).toBe("loaded");
  });

  it("drops an older save's echo for the same entry when a newer save has landed", async () => {
    // Two overlapping saves of one entry (a debounced autosave, then the
    // unmount flush or an explicit Save). The FIRST echo is slow and lands
    // last, which would merge superseded content back into the list.
    const result = await mountReady([rawEntry({ body: "loaded" })]);

    await raceTwoWrites(fetchMock, slowSaveOfSampleEntry(result), {
      dispatch: () => saveBody(result, "prefers-c-minor", "NEW"),
      echo: jsonResponse({ entry: rawEntry({ body: "NEW" }) }),
    });

    expect(readyEntries(result)[0]?.body).toBe("NEW");
  });

  it("does not let a save of one entry discard another entry's echo", async () => {
    // Ordering is per entry: a collection-wide newest-write-wins rule would
    // drop this first entry's merge just because a second entry was saved after.
    const result = await mountReady([
      rawEntry({ body: "loaded" }),
      rawEntry({ name: "loose-drums", body: "loaded" }),
    ]);

    await raceTwoWrites(
      fetchMock,
      {
        dispatch: () => saveBody(result, "prefers-c-minor", "A"),
        echo: jsonResponse({ entry: rawEntry({ body: "A" }) }),
      },
      {
        dispatch: () => saveBody(result, "loose-drums", "B"),
        echo: jsonResponse({
          entry: rawEntry({ name: "loose-drums", body: "B" }),
        }),
      },
    );

    expect(readyEntries(result).map((entry) => entry.body)).toStrictEqual([
      "A",
      "B",
    ]);
  });

  it("keeps a delete that a slower save of the same entry would resurrect", async () => {
    const result = await mountReady([rawEntry({ body: "loaded" })]);

    await raceTwoWrites(fetchMock, slowSaveOfSampleEntry(result), {
      dispatch: () => result.current.deleteEntry("prefers-c-minor"),
      echo: jsonResponse({}),
    });

    expect(readyEntries(result)).toStrictEqual([]);
  });

  it("drops a refresh that a concurrent save superseded", async () => {
    const result = await mountReady([rawEntry({ body: "loaded" })]);

    await landSaveBeforeStaleRefresh(
      fetchMock,
      {
        save: async () =>
          await result.current.saveEntry("prefers-c-minor", {
            ...SAMPLE_INPUT,
            content: "MINE",
          }),
        refresh: async () => await result.current.refresh(),
      },
      {
        saved: { entry: rawEntry({ body: "MINE" }) },
        stale: { entries: [rawEntry({ body: "stale" })] },
      },
    );

    expect(readyEntries(result)[0]?.body).toBe("MINE");
  });
});
