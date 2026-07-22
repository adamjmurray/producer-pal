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

  it("treats a missing version part as 0 when latest is longer with a non-zero tail", () => {
    // The cases above all pass even when a missing part is read as `undefined`:
    // they either differ in a shared part or compare against a trailing 0. These
    // are the cases that ONLY pass when a missing part defaults to 0 — a shorter
    // `current` against a `latest` whose extra part is non-zero. This is the
    // realistic MIN_LIVE_VERSION-bump scenario (e.g. min "12.3.1", Live "12.3").
    expect(isNewerVersion("12.3", "12.3.1")).toBe(true);
    expect(isNewerVersion("1.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("12", "12.0.1")).toBe(true);
    // Symmetric reverse: a shorter `latest` is not newer than a longer `current`.
    expect(isNewerVersion("1.0.1", "1.0")).toBe(false);
    expect(isNewerVersion("12.0.1", "12")).toBe(false);
  });

  it("ignores a 4th version part (comparison stops at major.minor.patch)", () => {
    // The loop compares exactly 3 parts. A 4th component must not tip the
    // result — otherwise `for (i < 3)` widening to `i <= 3` would leak in.
    expect(isNewerVersion("1.2.3", "1.2.3.4")).toBe(false);
    expect(isNewerVersion("1.2.3.9", "1.2.3")).toBe(false);
  });

  it("trims before stripping a 'v' prefix (leading whitespace + v)", () => {
    // parseVersionParts must .trim() first so the "v" strip still fires; a
    // leading space would otherwise leave "v2" → parseInt → 0 and flip the sign.
    expect(isNewerVersion("1.0.0", " v2.0.0")).toBe(true);
    expect(isNewerVersion(" v2.0.0", "1.0.0")).toBe(false);
  });

  it("treats a malformed (non-numeric) part as 0, not as equal-to-anything", () => {
    // A part with no leading digits parses to NaN. NaN must normalize to 0 so the
    // comparison still resolves at that position — otherwise NaN makes both `l > c`
    // and `l < c` false, silently treating the part as equal and leaking the
    // decision to a later part (the wrong answer).
    // Malformed minor in `latest`: should read as 0 (< current's 5) → not newer.
    expect(isNewerVersion("1.5.0", "1.x.9")).toBe(false);
    // Malformed major in `current`: should read as 0 (< latest's 1) → newer.
    expect(isNewerVersion("x.0.0", "1.0.0")).toBe(true);
    // Empty part from a double dot reads as 0: "1..0" == "1.0.0".
    expect(isNewerVersion("1..0", "1.0.0")).toBe(false);
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
    // v-prefixed pre-release
    expect(isNewerVersion("v1.2.3-beta", "v1.2.3")).toBe(true);
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

  it("returns version when tag_name has no v prefix", async () => {
    mockFetchResponse({ tag_name: "2.0.0" });
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
    // Body carries a genuinely-newer tag: only the `!response.ok` guard keeps
    // this null. A mutant that drops that guard would fall through and return
    // the version, so the payload must be one that would otherwise "succeed".
    mockFetchResponse({ tag_name: "v2.0.0" }, false);
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
