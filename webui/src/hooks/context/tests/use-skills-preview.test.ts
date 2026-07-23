// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSkillsPreview } from "#webui/hooks/context/use-skills-preview";
import {
  jsonResponse,
  renderAndWait,
} from "./doc-transport-test-helpers";

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

describe("useSkillsPreview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults the selection to the live combination and sizes the blob", async () => {
    stubFetch({ config: { notation: "stark", smallModelMode: true } });

    const { result } = renderHook(useSkillsPreview);

    await waitFor(() => {
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

    expect(status.kind === "ready" && status.preview).toMatchObject({
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

    await waitFor(() => {
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

    await waitFor(() => {
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

      const params = new URL(url).searchParams;

      return Promise.resolve(
        jsonResponse({
          head: params.get("notation"),
          driver: "c",
          skills: "s",
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(useSkillsPreview);

    await act(async () => {
      result.current.setNotation("midi-json");
    });

    await act(async () => {
      resolveConfig(jsonResponse({ notation: "stark", smallModelMode: true }));
      await Promise.resolve();
    });

    // The live mode is recorded, but the user's pick wins the selection.
    await waitFor(() => {
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

    expect(status.kind === "ready" && status.preview).toMatchObject({
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

    await waitFor(() => {
      expect(result.current.currentMode).not.toBeNull();
    });

    expect(result.current.currentMode?.notation).toBe("barbeat");
  });

  it("treats a thrown /config fetch as no live mode", async () => {
    const result = await renderReady({ config: "throw" });

    expect(result.current.currentMode).toBeNull();
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

      const params = new URL(url).searchParams;

      return Promise.resolve(
        jsonResponse({
          head: params.get("notation"),
          driver: "d",
          skills: "later",
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(useSkillsPreview);

    await act(async () => {
      result.current.setNotation("midi-json");
    });

    // Now reject the first (already-aborted) request; it must be swallowed.
    await act(async () => {
      rejectFirst(new Error("late failure"));
      await Promise.resolve();
    });

    await waitFor(() => {
      const status = result.current.status;

      expect(status.kind === "ready" && status.preview.skills).toBe("later");
    });
  });
});
