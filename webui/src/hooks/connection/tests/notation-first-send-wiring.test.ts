// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { useSyncServerSetting } from "#webui/hooks/connection/use-sync-server-setting";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useFirstSendGate } from "#webui/hooks/use-first-send-gate";
import { mockConfigResponse } from "./use-remote-config-test-helpers";
import { openGate } from "#webui/test-utils/async-test-helpers";

// The real chain that decides which notation a brand-new conversation locks:
//
//   GET /config → serverNotation → useSyncServerSetting → settings.notation
//
// with useFirstSendGate holding the first send until that value is a real
// answer. Composed for real (no mocked hooks) so the links are pinned together
// rather than one at a time: drop the gate and the first send locks whatever
// provisional default it happened to see.
//
// useChatModeState composes these same pieces (App owns the sync); the
// system-prompt half of its OR is covered in use-first-send-gate.test.ts.
//
// serverLiveApiEnabled is checked here too: it is locked at the same first send
// (stamped into the toolset) but has no known-flag of its own, so this chain is
// all that keeps it from pinning a provisional false.
function useNotationSendHarness(
  send: (notation: string, liveApiEnabled: boolean) => void,
  observe?: (known: boolean, notation: string) => void,
) {
  const remoteConfig = useRemoteConfig("connected");
  const settings = useSettings();

  observe?.(settings.notationKnown, settings.notation);

  useSyncServerSetting(
    remoteConfig.serverNotation,
    settings.notationDirty,
    settings.seedNotation,
  );

  return useFirstSendGate(!settings.notationKnown, async () => {
    send(settings.notation, remoteConfig.serverLiveApiEnabled);
  });
}

// Drive the fetch → seed → gate chain forward. One act() per round on purpose:
// Preact defers renders until an act callback RETURNS, so awaiting the parked
// send inside a single act would deadlock — the render that releases it could
// never run.
async function flushRenders(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("notation first-send wiring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("locks the server's notation for a send fired before /config answers", async () => {
    // Hold /config in flight so the send lands inside the fetch window — the
    // exact case that used to lock "barbeat" on a device set to "stark".
    const [configInFlight, releaseConfig] = openGate();

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await configInFlight;

      return mockConfigResponse({ notation: "stark", liveApiEnabled: true });
    });

    const send = vi.fn();
    const { result } = renderHook(() => useNotationSendHarness(send));

    // Firing while parked only registers a waiter (no state update), so this
    // needs no act() wrapper.
    const sendPromise = result.current("hi");

    await flushRenders();
    expect(send).not.toHaveBeenCalled();

    releaseConfig();
    await flushRenders();
    await act(async () => {
      await sendPromise;
    });

    // The Live API flag rides this same GET and has no known-flag of its own:
    // the notation wait is the ONLY thing keeping the first send from stamping
    // a provisional false into the toolset it pins. Asserted here so relaxing
    // that wait fails a test instead of silently pinning the tool off.
    expect(send).toHaveBeenCalledExactlyOnceWith("stark", true);
  });

  it("lets the send through with the default when /config is unreachable", async () => {
    // No answer is coming, so the provisional default is the right answer and
    // the gate must not park the first turn forever.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const send = vi.fn();
    const { result } = renderHook(() => useNotationSendHarness(send));

    const sendPromise = result.current("hi");

    await flushRenders();
    await act(async () => {
      await sendPromise;
    });

    expect(send).toHaveBeenCalledWith("barbeat", false);
  });

  it("never reports the notation as known while it is still the stale default", async () => {
    // The invariant the gate is built on, and the reason `notationKnown` lives
    // in useSettings next to the value instead of being derived from
    // useRemoteConfig: both land in one state update, so no render can see
    // known=true with the provisional default still in place. A flag derived a
    // layer upstream flips a render earlier, and the gate would then release the
    // parked send while the sender can still only see "barbeat" — silently
    // reintroducing the very bug it exists to prevent.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockConfigResponse({ notation: "stark" }),
    );

    const observed: Array<{ known: boolean; notation: string }> = [];

    renderHook(() =>
      useNotationSendHarness(vi.fn(), (known, notation) => {
        observed.push({ known, notation });
      }),
    );

    await flushRenders();

    // Sanity: the chain really did run and reach the server's value.
    expect(observed.some((o) => o.known && o.notation === "stark")).toBe(true);

    expect(
      observed.filter((o) => o.known && o.notation !== "stark"),
    ).toStrictEqual([]);
  });
});
