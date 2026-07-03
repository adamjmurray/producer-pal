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
import { jsonResponse } from "./doc-memory-transport-test-helpers";

// happy-dom origin is http://localhost:3000/, so the endpoints resolve there.
const CONFIG_URL = "http://localhost:3000/config";

interface StubOptions {
  /** Live config to return, or "fail" for a non-ok /config response. */
  config?: { notation: string; smallModelMode: boolean } | "fail";
  /** How the preview endpoint responds ("ok" echoes the requested combo). */
  preview?: "ok" | "fail" | "throw";
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

    const params = new URL(url).searchParams;
    const notation = params.get("notation");
    const small = params.get("smallModel") === "true";

    return Promise.resolve(
      jsonResponse({
        head: notation,
        core: small ? "core-basic" : "core-standard",
        skills: `S:${notation}:${small}`,
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
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
      core: "core-basic",
      skills: "S:stark:true",
      charCount: "S:stark:true".length,
    });
  });

  it("falls back to bar|beat standard when /config fails", async () => {
    stubFetch({ config: "fail" });

    const { result } = renderHook(useSkillsPreview);

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

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
    stubFetch({ config: "fail" });

    const { result } = renderHook(useSkillsPreview);

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

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
    stubFetch({ config: "fail" });

    const { result } = renderHook(useSkillsPreview);

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    await act(async () => {
      result.current.setSmallModelMode(true);
    });

    await waitFor(() => {
      const status = result.current.status;

      expect(status.kind === "ready" && status.preview.core).toBe("core-basic");
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
        jsonResponse({ head: params.get("notation"), core: "c", skills: "s" }),
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

    const { result } = renderHook(useSkillsPreview);

    await waitFor(() => {
      expect(result.current.status.kind).toBe("error");
    });

    expect(
      result.current.status.kind === "error" && result.current.status.message,
    ).toContain("Skills preview failed");
  });

  it("stringifies a non-Error preview rejection", async () => {
    stubFetch({ config: "fail", preview: "throw" });

    const { result } = renderHook(useSkillsPreview);

    await waitFor(() => {
      expect(result.current.status).toStrictEqual({
        kind: "error",
        message: "preview boom",
      });
    });
  });
});
