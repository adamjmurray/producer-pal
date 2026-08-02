// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useSkillOverrides } from "#webui/hooks/context/use-skill-overrides";
import {
  deferred,
  installFetchMock,
  jsonResponse,
  raceTwoWrites,
  renderAndWait,
  useFakeTimersForPolling,
} from "./doc-transport-test-helpers";

// happy-dom origin is http://localhost:3000/, so the endpoints resolve there.
const LIST_URL = "http://localhost:3000/skill-overrides";
const SLOT_URL = "http://localhost:3000/skill-overrides/barbeat-standard";

/**
 * Build a server slot record with overridable fields.
 * @param over - Fields to override on the default record
 * @returns A raw slot record as the server would return it
 */
function rawSlot(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "barbeat-standard",
    title: "Core (standard)",
    description: "Slot description.",
    builtIn: "BUILT-IN",
    override: "",
    enabled: true,
    canDisable: true,
    drifted: false,
    provenance: null,
    ...over,
  };
}

/** A rendered hook's `result` handle. */
type HookResult = { current: ReturnType<typeof useSkillOverrides> };

/**
 * One slot's current override, asserting the collection is ready first.
 * @param result - The rendered hook's `result` handle
 * @param index - Position in the slot list
 * @returns That slot's override body
 */
function overrideOf(result: HookResult, index: number): string | undefined {
  const { status } = result.current;

  if (status.kind !== "ready") {
    throw new Error(`expected ready, got ${status.kind}`);
  }

  return status.slots[index]?.override;
}

describe("useSkillOverrides", () => {
  const fetchMock = installFetchMock();

  // Render the hook with an initial slots GET and wait for the ready status.
  // Most tests only need the mount to succeed before exercising a write.
  async function renderReady(
    slots: Array<Record<string, unknown>> = [rawSlot()],
  ): Promise<HookResult> {
    fetchMock.mockResolvedValueOnce(jsonResponse({ slots }));

    return await renderAndWait(useSkillOverrides, "ready");
  }

  it("loads and maps all slots on mount via a no-store GET", async () => {
    const result = await renderReady([
      rawSlot(),
      rawSlot({
        name: "stark",
        title: "stark notation",
        override: "MINE",
        drifted: true,
        provenance: { producerPalVersion: "1.4.0", builtInHash: "old" },
      }),
    ]);

    const status = result.current.status;

    expect(status.kind === "ready" && status.slots).toStrictEqual([
      {
        name: "barbeat-standard",
        title: "Core (standard)",
        description: "Slot description.",
        builtIn: "BUILT-IN",
        override: "",
        enabled: true,
        canDisable: true,
        gate: null,
        drifted: false,
        forkedFromVersion: null,
      },
      {
        name: "stark",
        title: "stark notation",
        description: "Slot description.",
        builtIn: "BUILT-IN",
        override: "MINE",
        enabled: true,
        canDisable: true,
        gate: null,
        drifted: true,
        forkedFromVersion: "1.4.0",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(LIST_URL, { cache: "no-store" });
  });

  it("maps each gate shape, and reads anything unrecognized as no gate", async () => {
    const result = await renderReady([
      rawSlot({ gate: ["ppal-read-clip", "ppal-create-clip"] }),
      rawSlot({ gate: "always" }),
      rawSlot({ gate: "conversation-only" }),
      // A driver, and — same handling — a value from a server this webui
      // doesn't understand. Saying nothing beats stating the wrong rule.
      rawSlot({ gate: null }),
      rawSlot({ gate: "made-up" }),
      rawSlot({ gate: [1, 2] }),
    ]);
    const status = result.current.status;

    expect(
      status.kind === "ready" && status.slots.map((s) => s.gate),
    ).toStrictEqual([
      ["ppal-read-clip", "ppal-create-clip"],
      "always",
      "conversation-only",
      null,
      null,
      null,
    ]);
  });

  it("falls back to an empty list when slots is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const { result } = renderHook(useSkillOverrides);

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({ kind: "ready", slots: [] });
    });
  });

  it("reports an error when the GET is not ok", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );

    const result = await renderAndWait(useSkillOverrides, "error");

    expect(
      result.current.status.kind === "error" && result.current.status.message,
    ).toContain("Skills request failed");
  });

  it("stringifies a non-Error rejection", async () => {
    fetchMock.mockRejectedValueOnce("plain string error");

    const result = await renderAndWait(useSkillOverrides, "error");

    expect(result.current.status).toStrictEqual({
      kind: "error",
      message: "plain string error",
    });
  });

  it("saveSlot PUTs the content and merges only the echoed slot", async () => {
    const result = await renderReady([
      rawSlot(),
      rawSlot({ name: "stark", title: "stark notation" }),
    ]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        slot: rawSlot({
          override: "MINE\n",
          provenance: { producerPalVersion: "1.5.0", builtInHash: "abc" },
        }),
      }),
    );

    let ok: boolean | undefined;

    await act(async () => {
      ok = await result.current.saveSlot("barbeat-standard", "MINE");
    });

    expect(ok).toBe(true);

    const status = result.current.status;

    expect(status.kind === "ready" && status.slots[0]).toMatchObject({
      name: "barbeat-standard",
      override: "MINE\n",
      forkedFromVersion: "1.5.0",
    });
    // The other slot is left untouched by the merge.
    expect(status.kind === "ready" && status.slots[1]).toMatchObject({
      name: "stark",
      override: "",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      SLOT_URL,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ content: "MINE" }),
      }),
    );
  });

  it("setSlotEnabled PUTs only the flag, so a body save can't be clobbered", async () => {
    const result = await renderReady([rawSlot({ override: "MINE\n" })]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ slot: rawSlot({ override: "MINE\n", enabled: false }) }),
    );

    await act(async () => {
      await result.current.setSlotEnabled("barbeat-standard", false);
    });

    const status = result.current.status;

    expect(status.kind === "ready" && status.slots[0]).toMatchObject({
      enabled: false,
      override: "MINE\n",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      SLOT_URL,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ enabled: false }),
      }),
    );
  });

  it("reads a slot with no enabled/canDisable fields as on and switchable", async () => {
    // Backwards-compatible read: an older server omits both, and defaulting the
    // other way would show every fragment as switched off.
    const result = await renderReady([
      { ...rawSlot(), enabled: undefined, canDisable: undefined },
    ]);

    const status = result.current.status;

    expect(status.kind === "ready" && status.slots[0]).toMatchObject({
      enabled: true,
      canDisable: true,
    });
  });

  it("resetSlot DELETEs the slot and merges the reset echo", async () => {
    const result = await renderReady([rawSlot({ override: "MINE\n" })]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ slot: rawSlot() }));

    await act(async () => {
      await result.current.resetSlot("barbeat-standard");
    });

    const status = result.current.status;

    expect(status.kind === "ready" && status.slots[0]?.override).toBe("");
    expect(fetchMock).toHaveBeenLastCalledWith(
      SLOT_URL,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("surfaces a save error when the write is not ok", async () => {
    const result = await renderReady();

    fetchMock.mockResolvedValueOnce(
      new Response("nope", { status: 403, statusText: "Forbidden" }),
    );

    let ok: boolean | undefined;

    await act(async () => {
      ok = await result.current.saveSlot("barbeat-standard", "x");
    });

    expect(ok).toBe(false);
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toContain("Skills update failed");
  });

  it("resetSaveStatus clears the indicator when the edited slot changes", async () => {
    const result = await renderReady();

    fetchMock.mockResolvedValueOnce(jsonResponse({ slot: rawSlot() }));

    await act(async () => {
      await result.current.saveSlot("barbeat-standard", "x");
    });

    expect(result.current.saveStatus).toBe("saved");

    await act(async () => {
      result.current.resetSaveStatus();
    });

    expect(result.current.saveStatus).toBe("idle");
    expect(result.current.saveError).toBeNull();
  });

  it("does not paint a save outcome onto a slot switched to mid-flight", async () => {
    const result = await renderReady();

    const putEcho = deferred<Response>();

    fetchMock.mockReturnValueOnce(putEcho.promise);

    await act(async () => {
      const savePromise = result.current.saveSlot("barbeat-standard", "MINE");

      // The user switches slots (the screen calls resetSaveStatus) before the
      // save echoes — the pending save must not repaint the indicator.
      result.current.resetSaveStatus();

      putEcho.resolve(jsonResponse({ slot: rawSlot({ override: "MINE\n" }) }));
      await savePromise;
    });

    // The slot merge still applied, but the shared indicator stays idle.
    expect(result.current.saveStatus).toBe("idle");
    const status = result.current.status;

    expect(status.kind === "ready" && status.slots[0]?.override).toBe("MINE\n");
  });

  it("leaves the status untouched when a write resolves before the load", async () => {
    // GET never resolves, so status is still "loading" when the write echoes.
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));

    const { result } = renderHook(useSkillOverrides);

    fetchMock.mockResolvedValueOnce(jsonResponse({ slot: rawSlot() }));

    await act(async () => {
      await result.current.saveSlot("barbeat-standard", "x");
    });

    expect(result.current.status.kind).toBe("loading");
  });

  it("re-fetches on window focus so external writes surface", async () => {
    const result = await renderReady([rawSlot({ override: "v1" })]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ slots: [rawSlot({ override: "v2" })] }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    await waitFor(() => {
      const status = result.current.status;

      expect(status.kind === "ready" && status.slots[0]?.override).toBe("v2");
    });
  });

  it("drops an older save's echo for the same slot when a newer save has landed", async () => {
    // The slot editor autosaves (debounce flush, then a blur flush behind it),
    // so two writes of one slot overlap. An older echo landing last would put
    // `override` back and raise a spurious "changed outside the editor" banner
    // whose Reload adopts the superseded content.
    const result = await renderReady([rawSlot({ override: "loaded" })]);

    await raceTwoWrites(
      fetchMock,
      {
        dispatch: () => result.current.saveSlot("barbeat-standard", "OLD"),
        echo: jsonResponse({ slot: rawSlot({ override: "OLD" }) }),
      },
      {
        dispatch: () => result.current.saveSlot("barbeat-standard", "NEW"),
        echo: jsonResponse({ slot: rawSlot({ override: "NEW" }) }),
      },
    );

    expect(overrideOf(result, 0)).toBe("NEW");
  });

  it("keeps the indicator on Saving when a superseded write resolves first", async () => {
    // A superseded write's result is discarded, so its resolution says nothing
    // about what is on disk. Painting "Saved" here tells the user the edit they
    // just made is persisted while its PUT is still on the wire.
    const result = await renderReady([rawSlot({ override: "loaded" })]);

    const older = deferred<Response>();
    const newer = deferred<Response>();

    fetchMock.mockReturnValueOnce(older.promise);
    fetchMock.mockReturnValueOnce(newer.promise);

    let newerPending: Promise<boolean> | undefined;

    await act(async () => {
      const olderPending = result.current.saveSlot("barbeat-standard", "OLD");

      newerPending = result.current.saveSlot("barbeat-standard", "NEW");
      older.resolve(jsonResponse({ slot: rawSlot({ override: "OLD" }) }));
      await olderPending;
    });

    expect(result.current.saveStatus).toBe("saving");

    await act(async () => {
      newer.resolve(jsonResponse({ slot: rawSlot({ override: "NEW" }) }));
      await newerPending;
    });

    expect(result.current.saveStatus).toBe("saved");
    expect(overrideOf(result, 0)).toBe("NEW");
  });

  it("does not let a save of one slot discard another slot's echo", async () => {
    // Ordering is per slot: newest-write-wins across the whole collection would
    // drop this first slot's merge just because a second slot was saved after.
    const result = await renderReady([
      rawSlot({ override: "loaded" }),
      rawSlot({ name: "stark", override: "loaded" }),
    ]);

    await raceTwoWrites(
      fetchMock,
      {
        dispatch: () => result.current.saveSlot("barbeat-standard", "A"),
        echo: jsonResponse({ slot: rawSlot({ override: "A" }) }),
      },
      {
        dispatch: () => result.current.saveSlot("stark", "B"),
        echo: jsonResponse({ slot: rawSlot({ name: "stark", override: "B" }) }),
      },
    );

    expect(overrideOf(result, 0)).toBe("A");
    expect(overrideOf(result, 1)).toBe("B");
  });

  it("drops a refresh that a concurrent save superseded", async () => {
    const result = await renderReady([rawSlot({ override: "loaded" })]);

    const putEcho = deferred<Response>();
    const staleGet = deferred<Response>();

    fetchMock.mockReturnValueOnce(putEcho.promise); // save PUT
    fetchMock.mockReturnValueOnce(staleGet.promise); // refresh GET (pre-save read)

    await act(async () => {
      const savePromise = result.current.saveSlot("barbeat-standard", "MINE");
      const refreshPromise = result.current.refresh();

      // The save echo lands first and sets the override.
      putEcho.resolve(jsonResponse({ slot: rawSlot({ override: "MINE\n" }) }));
      await savePromise;

      // The stale GET resolves last; the overlap guard must drop it.
      staleGet.resolve(
        jsonResponse({ slots: [rawSlot({ override: "stale" })] }),
      );
      await refreshPromise;
    });

    const status = result.current.status;

    expect(status.kind === "ready" && status.slots[0]?.override).toBe("MINE\n");
  });

  describe("focus-gated polling", () => {
    const POLL_MS = useFakeTimersForPolling();

    it("re-reads each interval while focused", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ slots: [rawSlot({ override: "old" })] }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ slots: [rawSlot({ override: "external" })] }),
        );

      const { result } = renderHook(useSkillOverrides);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      const status = result.current.status;

      expect(status.kind === "ready" && status.slots[0]?.override).toBe(
        "external",
      );
    });

    it("does not poll while the window is unfocused", async () => {
      vi.spyOn(document, "hasFocus").mockReturnValue(false);
      fetchMock.mockResolvedValueOnce(jsonResponse({ slots: [rawSlot()] }));

      renderHook(useSkillOverrides);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      fetchMock.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
