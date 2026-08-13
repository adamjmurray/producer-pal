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

  it("prompts an rc tester at GA promotion, which is the whole update path now", () => {
    // Shipped versions are real `-rcN` strings, so promotion is an ordinary
    // version difference and one request answers it. This replaced the second
    // GitHub request (resolving the release tag to a commit) that existed only
    // because every build of a cycle used to call itself the GA version.
    expect(isNewerVersion("2.1.0-rc1", "2.1.0")).toBe(true);
    expect(isNewerVersion("2.1.0-rc4", "2.1.0")).toBe(true);
  });

  it("never prompts an rc tester to install the older stable release", () => {
    // `/releases/latest` hides pre-releases, so mid-cycle a tester on 2.1.0-rc1
    // gets 2.0.0 back. A downgrade prompt must not be reachable.
    expect(isNewerVersion("2.1.0-rc1", "2.0.0")).toBe(false);
  });

  it("does not announce a mid-cycle re-cut to a tester on an earlier rc", () => {
    // Accepted: `/releases/latest` would never surface rc2 anyway (it's marked
    // pre-release), so the comparison is moot. Testers are told directly.
    expect(isNewerVersion("2.1.0-rc1", "2.1.0-rc2")).toBe(false);
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

  it("reports a GA promotion to a tester holding the pre-release", async () => {
    // The end-to-end shape of what replaced the tag-to-commit request: a real
    // `-rcN` in the artifact makes promotion an ordinary version difference.
    mockFetchResponse({ tag_name: "v2.1.0" });

    expect(await checkForUpdate("2.1.0-rc3")).toStrictEqual({
      version: "2.1.0",
    });
  });

  it("stays quiet mid-cycle, when latest is the older stable release", async () => {
    mockFetchResponse({ tag_name: "v2.0.0" });
    expect(await checkForUpdate("2.1.0-rc1")).toBeNull();
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
    // The URL is load-bearing, not incidental: `/releases/latest` is the one
    // endpoint that hides pre-releases, which is what keeps stable users from
    // being offered a beta. This assertion is the only guard on that choice —
    // every mock here hand-supplies a tag_name, so none can model GitHub's own
    // exclusion rule. See the comment on RELEASES_URL.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ tag_name: "v2.0.0" })));

    await checkForUpdate("1.0.0");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/adamjmurray/producer-pal/releases/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("makes exactly one request, whatever the answer is", async () => {
    // GitHub's unauthenticated limit is 60/hr per IP. This function used to make
    // a second request to resolve the release tag to a commit; real `-rcN`
    // versions made that unnecessary, and it must not come back.
    for (const [current, tag] of [
      ["1.0.0", "v2.0.0"], // update available
      ["2.0.0", "v2.0.0"], // up to date
      ["2.1.0-rc1", "v2.0.0"], // pre-release, ahead of latest stable
      ["2.1.0-rc1", "v2.1.0"], // pre-release, promoted
    ] as const) {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify({ tag_name: tag })));

      await checkForUpdate(current);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      fetchSpy.mockRestore();
    }
  });
});
