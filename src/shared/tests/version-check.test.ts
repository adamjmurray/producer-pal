// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { checkForUpdate, isNewerVersion } from "../version-check.ts";

describe("isNewerVersion", () => {
  it("returns true when latest has a newer patch", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns true when latest has a newer minor", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("returns true when latest has a newer major", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns false when versions are the same", () => {
    expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("handles v prefix on both strings", () => {
    expect(isNewerVersion("v1.0.0", "v1.0.1")).toBe(true);
  });

  it("handles v prefix on only one string", () => {
    expect(isNewerVersion("v1.0.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.0", "v1.0.1")).toBe(true);
  });

  it("compares 2-part version against 3-part version", () => {
    expect(isNewerVersion("12.2", "12.3.0")).toBe(true);
    expect(isNewerVersion("12.3", "12.3.0")).toBe(false);
    expect(isNewerVersion("13.0", "12.3.0")).toBe(false);
  });

  it("ignores beta suffixes like 12.4b7", () => {
    expect(isNewerVersion("12.4b7", "12.3.0")).toBe(false);
    expect(isNewerVersion("12.2b3", "12.3.0")).toBe(true);
    expect(isNewerVersion("12.3b1", "12.3.0")).toBe(false);
  });

  it("ignores trailing whitespace", () => {
    expect(isNewerVersion("12.4b7   ", "12.3.0")).toBe(false);
    expect(isNewerVersion("12.2   ", "12.3.0")).toBe(true);
  });

  it("treats dash-delimited pre-release as earlier than stable", () => {
    // current is pre-release, latest is stable → latest is newer
    expect(isNewerVersion("1.2.3-beta", "1.2.3")).toBe(true);
    expect(isNewerVersion("1.2.3-rc1", "1.2.3")).toBe(true);
  });

  it("does not treat pre-release latest as newer than same stable", () => {
    // latest has suffix, current doesn't → latest is NOT newer
    expect(isNewerVersion("1.2.3", "1.2.3-beta")).toBe(false);
  });

  it("treats both pre-release versions as equal", () => {
    expect(isNewerVersion("1.2.3-beta", "1.2.3-rc1")).toBe(false);
    expect(isNewerVersion("1.2.3-rc1", "1.2.3-beta")).toBe(false);
  });

  it("numeric difference takes priority over pre-release suffix", () => {
    expect(isNewerVersion("1.2.3", "1.2.4-beta")).toBe(true);
    expect(isNewerVersion("1.2.4", "1.2.3-beta")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  function mockFetchResponse(body: unknown, ok = true): void {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: ok ? 200 : 404 }),
    );
  }

  it("returns version when a newer release exists", async () => {
    mockFetchResponse({ tag_name: "v2.0.0" });
    const result = await checkForUpdate("1.0.0");

    expect(result).toStrictEqual({ version: "2.0.0" });
  });

  it("returns null when the current version matches latest", async () => {
    mockFetchResponse({ tag_name: "v1.0.0" });
    expect(await checkForUpdate("1.0.0")).toBeNull();
  });

  it("returns null when the current version is newer", async () => {
    mockFetchResponse({ tag_name: "v1.0.0" });
    expect(await checkForUpdate("2.0.0")).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    expect(await checkForUpdate("1.0.0")).toBeNull();
  });

  it("returns null on non-200 response", async () => {
    mockFetchResponse({}, false);
    expect(await checkForUpdate("1.0.0")).toBeNull();
  });

  it("returns null when response has no tag_name", async () => {
    mockFetchResponse({ name: "v2.0.0" });
    expect(await checkForUpdate("1.0.0")).toBeNull();
  });

  it("returns null when tag_name is not a string", async () => {
    mockFetchResponse({ tag_name: 123 });
    expect(await checkForUpdate("1.0.0")).toBeNull();
  });

  it("passes a timeout signal to fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ tag_name: "v2.0.0" })));

    await checkForUpdate("1.0.0");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/adamjmurray/producer-pal/releases/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
