// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSkillsPreview } from "#webui/hooks/context/use-skills-preview";
import { jsonResponse, renderAndWait } from "./doc-transport-test-helpers";

// happy-dom origin is http://localhost:3000/, so the endpoints resolve there.
const CONFIG_URL = "http://localhost:3000/config";

interface StubOptions {
  /**
   * Live config to return, "fail" for a non-ok /config response, or "throw"
   * for a rejected fetch (network error).
   */
  config?: { notation: string; smallModelMode: boolean } | "fail" | "throw";
  /**
   * How the preview endpoint responds ("ok" echoes the requested combo,
   * "empty" returns a body with no head/driver/skills fields).
   */
  preview?: "ok" | "fail" | "throw" | "empty";
}

/**
 * Stub `fetch` to route /config and /skills-preview. The preview echoes the
 * requested combination so a test can assert what was fetched.
 * @param options - Which config + preview behavior to simulate
 * @returns The fetch mock
 */
function stubFetch(options: StubOptions = {}): ReturnType<typeof vi.fn> {
  const { config = "fail", preview = "ok" } = options;
  const fetchMock = vi.fn((input: unknown) => {
    const url = String(input);

    if (url.startsWith(CONFIG_URL)) {
      if (config === "throw") return Promise.reject(new Error("config boom"));

      return config === "fail"
        ? Promise.resolve(new Response("no", { status: 500 }))
        : Promise.resolve(jsonResponse(config));
    }

    if (preview === "fail") {
      return Promise.resolve(
        new Response("no", { status: 500, statusText: "Server Error" }),
      );
    }

    if (preview === "throw") return Promise.reject("preview boom");

    if (preview === "empty") return Promise.resolve(jsonResponse({}));

    const params = new URL(url).searchParams;
    const notation = params.get("notation");
    const small = params.get("smallModel") === "true";

    return Promise.resolve(
      jsonResponse({
        head: notation,
        driver: small ? "basic" : "standard",
        skills: `S:${notation}:${small}`,
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

/**
 * Stub fetch for the given scenario, render the hook, and wait for ready.
 * @param options - Which config + preview behavior to simulate
 * @returns The rendered hook result handle
 */
async function renderReady(
  options: StubOptions = {},
): Promise<{ current: ReturnType<typeof useSkillsPreview> }> {
  stubFetch(options);

  return await renderAndWait(useSkillsPreview, "ready");
}

/**
 * A preview response that echoes back the notation the request asked for, so a
 * case can assert which selection the hook actually fetched.
 * @param url - The preview request URL
 * @param driver - Driver body to return
 * @param skills - Skills body to return
 * @returns The stubbed preview response
 */
function echoPreview(
  url: string,
  driver: string,
  skills: string,
): Promise<Response> {
  const params = new URL(url).searchParams;

  return Promise.resolve(
    jsonResponse({ head: params.get("notation"), driver, skills }),
  );
}

/**
 * Install a bespoke fetch stub, mount the hook, and switch the selection to
 * midi-json — the arrangement the hand-rolled-transport cases share.
 * @param fetchMock - The fetch stub for this case
 * @returns The rendered hook result
 */
async function mountAndSelectMidiJson(fetchMock: typeof fetch) {
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(useSkillsPreview);

  await act(async () => {
    result.current.setNotation("midi-json");
  });

  return result;
}

describe("useSkillsPreview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("defaults the selection to the live combination and sizes the blob", async () => {
    stubFetch({ config: { notation: "stark", smallModelMode: true } });

    const { result } = renderHook(useSkillsPreview);

    await waitForHookState(() => {
      expect(
        result.current.status.kind === "ready" &&
          result.current.selected.notation,
      ).toBe("stark");
    });

    expect(result.current.currentMode).toStrictEqual({
      notation: "stark",
      smallModelMode: true,
    });

    const status = result.current.status;

    expect(status.kind === "ready" && status.preview).toStrictEqual({
      dropped: [],
      warnings: [],
      notation: "stark",
      smallModelMode: true,
      head: "stark",
      driver: "basic",
      skills: "S:stark:true",
      charCount: "S:stark:true".length,
    });
  });

  it("falls back to bar|beat standard when /config fails", async () => {
    const result = await renderReady({ config: "fail" });

    expect(result.current.currentMode).toBeNull();
    expect(result.current.selected).toStrictEqual({
      notation: "barbeat",
      smallModelMode: false,
    });
    const status = result.current.status;

    expect(status.kind === "ready" && status.preview.skills).toBe(
      "S:barbeat:false",
    );
  });

  it("refetches when the notation changes", async () => {
    const result = await renderReady({ config: "fail" });

    await act(async () => {
      result.current.setNotation("midi-json");
    });

    await waitForHookState(() => {
      const status = result.current.status;

      expect(status.kind === "ready" && status.preview.skills).toBe(
        "S:midi-json:false",
      );
    });
    expect(result.current.selected.notation).toBe("midi-json");
  });

  it("refetches when the model size changes", async () => {
    const result = await renderReady({ config: "fail" });

    await act(async () => {
      result.current.setSmallModelMode(true);
    });

    await waitForHookState(() => {
      const status = result.current.status;

      expect(status.kind === "ready" && status.preview.driver).toBe("basic");
    });
  });

  it("keeps a user's selection even after /config resolves", async () => {
    // /config is pending so the user picks before the live mode arrives.
    let resolveConfig: (r: Response) => void = () => {};
    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url.startsWith(CONFIG_URL)) {
        return new Promise<Response>((resolve) => {
          resolveConfig = resolve;
        });
      }

      return echoPreview(url, "c", "s");
    });

    const result = await mountAndSelectMidiJson(fetchMock);

    await act(async () => {
      resolveConfig(jsonResponse({ notation: "stark", smallModelMode: true }));
      await Promise.resolve();
    });

    // The live mode is recorded, but the user's pick wins the selection.
    await waitForHookState(() => {
      expect(result.current.currentMode?.notation).toBe("stark");
    });
    expect(result.current.selected.notation).toBe("midi-json");
  });

  it("reports an error when the preview request is not ok", async () => {
    stubFetch({ config: "fail", preview: "fail" });

    const result = await renderAndWait(useSkillsPreview, "error");

    expect(
      result.current.status.kind === "error" && result.current.status.message,
    ).toContain("Skills preview failed");
  });

  it("stringifies a non-Error preview rejection", async () => {
    stubFetch({ config: "fail", preview: "throw" });

    const result = await renderAndWait(useSkillsPreview, "error");

    expect(result.current.status).toStrictEqual({
      kind: "error",
      message: "preview boom",
    });
  });

  it("defaults missing head/driver/skills fields to empty strings", async () => {
    const result = await renderReady({ config: "fail", preview: "empty" });

    const status = result.current.status;

    expect(status.kind === "ready" && status.preview).toStrictEqual({
      dropped: [],
      notation: "barbeat",
      smallModelMode: false,
      warnings: [],
      head: "",
      driver: "",
      skills: "",
      charCount: 0,
    });
  });

  it("defaults the live notation to bar|beat when /config reports an unknown one", async () => {
    stubFetch({
      config: { notation: "bogus-notation", smallModelMode: false },
    });

    const { result } = renderHook(useSkillsPreview);

    await waitForHookState(() => {
      expect(result.current.currentMode).not.toBeNull();
    });

    expect(result.current.currentMode?.notation).toBe("barbeat");
  });

  it("treats a thrown /config fetch as no live mode", async () => {
    const result = await renderReady({ config: "throw" });

    expect(result.current.currentMode).toBeNull();
  });

  describe("tool gating", () => {
    /** The query string of the most recent preview request. */
    function lastPreviewQuery(fetchMock: ReturnType<typeof vi.fn>): string {
      const previews = fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((url) => !url.startsWith(CONFIG_URL));

      return new URL(previews.at(-1) as string).search;
    }

    it("gates on the toolset saved in settings by default", async () => {
      localStorage.setItem(
        "producer_pal_enabled_tools",
        JSON.stringify({ "ppal-library": false, "ppal-read-clip": true }),
      );
      const fetchMock = stubFetch({ config: "fail" });

      await renderAndWait(useSkillsPreview, "ready");

      // Only the explicit off switch rides along; an enabled tool is not listed.
      expect(lastPreviewQuery(fetchMock)).toContain(
        "disabledTools=ppal-library",
      );
      expect(lastPreviewQuery(fetchMock)).not.toContain("allTools");
    });

    it("asks for every fragment once gating is switched off", async () => {
      localStorage.setItem(
        "producer_pal_enabled_tools",
        JSON.stringify({ "ppal-library": false }),
      );
      const fetchMock = stubFetch({ config: "fail" });
      const result = await renderAndWait(useSkillsPreview, "ready");

      expect(result.current.enabledToolsOnly).toBe(true);

      await act(async () => {
        result.current.setEnabledToolsOnly(false);
      });

      await waitForHookState(() => {
        expect(lastPreviewQuery(fetchMock)).toContain("allTools=true");
      });
      expect(lastPreviewQuery(fetchMock)).not.toContain("disabledTools");
      expect(result.current.enabledToolsOnly).toBe(false);
    });

    it("sends no toolset when nothing is switched off", async () => {
      const fetchMock = stubFetch({ config: "fail" });

      await renderAndWait(useSkillsPreview, "ready");

      // Gating is still ON — the device whitelist alone decides.
      expect(lastPreviewQuery(fetchMock)).not.toContain("disabledTools");
      expect(lastPreviewQuery(fetchMock)).not.toContain("allTools");
    });
  });

  it("ignores a preview rejection from a superseded (aborted) request", async () => {
    // The first preview is parked; a selection change aborts it, then it
    // rejects late. The aborted-guard must swallow it and keep the newer result.
    let rejectFirst: (err: unknown) => void = () => {};
    let previewCall = 0;
    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url.startsWith(CONFIG_URL)) {
        return Promise.resolve(new Response("no", { status: 500 }));
      }

      previewCall += 1;

      if (previewCall === 1) {
        return new Promise<Response>((_, reject) => {
          rejectFirst = reject;
        });
      }

      return echoPreview(url, "d", "later");
    });

    const result = await mountAndSelectMidiJson(fetchMock);

    // Now reject the first (already-aborted) request; it must be swallowed.
    await act(async () => {
      rejectFirst(new Error("late failure"));
      await Promise.resolve();
    });

    await waitForHookState(() => {
      const status = result.current.status;

      expect(status.kind === "ready" && status.preview.skills).toBe("later");
    });
  });
});
