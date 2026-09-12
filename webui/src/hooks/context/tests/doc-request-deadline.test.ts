// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, waitFor } from "@testing-library/preact";
import { describe, expect, it, type Mock, vi } from "vitest";
import { useGlobalContext } from "#webui/hooks/context/use-global-context";
import { useSkillOverrides } from "#webui/hooks/context/use-skill-overrides";
import {
  installFetchMock,
  jsonResponse,
  renderAndWait,
} from "./doc-transport-test-helpers";

// Short enough that the hung requests below give up inside a test, long enough
// that nothing else in the suite trips it. File-scoped, which is why these live
// apart from the per-hook suites.
vi.mock(import("#webui/lib/constants/transport"), () => ({
  DOC_REQUEST_TIMEOUT_MS: 20,
}));

const SLOT_URL = "http://localhost:3000/skill-overrides/barbeat-standard";

const RAW_SLOT = {
  name: "barbeat-standard",
  title: "Core (standard)",
  description: "Slot description.",
  builtIn: "BUILT-IN",
  override: "",
  enabled: true,
  canDisable: true,
  drifted: false,
  provenance: null,
};

/**
 * A request the server accepts and never answers — it settles only when the
 * transport's own deadline aborts its signal, the way a real fetch does.
 * @param signal - The abort signal the transport attached to the request
 * @returns A promise that rejects once that signal aborts
 */
function unanswered(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason));
  });
}

describe("~/.producer-pal request deadlines", () => {
  const fetchMock = installFetchMock();

  /**
   * Stub fetch so the request matching `hangWhen` is never answered and every
   * other one gets `body`.
   * @param hangWhen - Picks the request to leave unanswered
   * @param body - JSON body for every other request
   */
  function hangOn(
    hangWhen: (url: string, init?: RequestInit) => boolean,
    body: unknown,
  ): void {
    // Cast because installFetchMock returns the untyped vi.fn(), whose
    // implementations are void-returning.
    (
      fetchMock as unknown as Mock<
        (url: string, init?: RequestInit) => Promise<Response>
      >
    ).mockImplementation((url, init) =>
      hangWhen(url, init)
        ? unanswered(init?.signal ?? undefined)
        : Promise.resolve(jsonResponse(body)),
    );
  }

  it("gives up on a single-doc write and lets refresh commit again", async () => {
    hangOn(() => false, { content: "start" });

    const result = await renderAndWait(useGlobalContext, "ready");

    hangOn((_url, init) => init?.method === "PUT", { content: "external" });

    let saved: boolean | undefined;
    const writing = act(async () => {
      saved = await result.current.save("typed");
    });

    // While the write is out there, refreshes are correctly held: its echo is
    // the newer truth. The bug was that this state was permanent.
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "start",
    });

    await writing;

    expect(saved).toBe(false);
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toContain("update timed out");

    // The counter the refresh guard reads is only decremented once the write
    // settles, so without a deadline every later refresh — the poll included —
    // discards its result for the rest of the editor's mount.
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status).toStrictEqual({
      kind: "ready",
      content: "external",
    });
  });

  it("gives up on a single-doc read", async () => {
    hangOn(() => true, {});

    const result = await renderAndWait(useGlobalContext, "error");

    expect(
      result.current.status.kind === "error" && result.current.status.message,
    ).toContain("request timed out");
  });

  it("gives up on a skill-slot write", async () => {
    hangOn(() => false, { slots: [RAW_SLOT] });

    const result = await renderAndWait(useSkillOverrides, "ready");

    hangOn((url) => url === SLOT_URL, { slots: [RAW_SLOT] });

    let saved: boolean | undefined;

    await act(async () => {
      saved = await result.current.saveSlot("barbeat-standard", "mine");
    });

    expect(saved).toBe(false);
    expect(result.current.saveStatus).toBe("error");
    expect(result.current.saveError).toContain("Skills update timed out");
  });

  it("gives up on the skill-slot list read", async () => {
    hangOn(() => true, {});

    const result = await renderAndWait(useSkillOverrides, "error");

    expect(
      result.current.status.kind === "error" && result.current.status.message,
    ).toContain("Skills request timed out");

    // The poll recovers on its own once the server answers again.
    hangOn(() => false, { slots: [RAW_SLOT] });

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });
  });
});
