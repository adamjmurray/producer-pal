// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  BUILD_SHA,
  DISABLED_TOOLS_HEADER,
  MIN_LIVE_VERSION,
  SAME_TIME_EPSILON,
  SMALL_MODEL_MODE_HEADER,
  VERSION,
  resolveEnabledTools,
  resolveSmallModelMode,
} from "#src/shared/config.ts";

describe("config constants", () => {
  it("VERSION is a release or an -rcN pre-release, and nothing else", () => {
    // Anchored at both ends on purpose. This string ships in the artifact and
    // is what every install compares against GitHub's latest release, so the
    // update check's behavior follows from its shape: an unrecognized suffix
    // would still parse as a pre-release (older than the same numbers without
    // one) and quietly nag testers to "upgrade" to what they already have.
    // scripts/build-and-release/helpers/next-version.ts produces exactly this.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-rc[1-9]\d*)?$/);
  });

  it("MIN_LIVE_VERSION is a 3-part version with no 'v' prefix", () => {
    // Consumed by the Live-version gate; an empty or malformed value would
    // silently break the "your Live is too old" check.
    expect(MIN_LIVE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("SAME_TIME_EPSILON is a small positive position tolerance", () => {
    expect(SAME_TIME_EPSILON).toBeGreaterThan(0);
    expect(SAME_TIME_EPSILON).toBeLessThan(0.01);
  });

  it('BUILD_SHA is "" when nothing was baked in', () => {
    // Running from source. The update check treats "" as "build unknown" and
    // falls back to comparing version numbers alone.
    expect(BUILD_SHA).toBe("");
  });

  it("BUILD_SHA carries the SHA the build substituted in", async () => {
    vi.resetModules();
    vi.stubEnv("BUILD_SHA", "1a2b3c4");

    const reloaded = await import("#src/shared/config.ts");

    expect(reloaded.BUILD_SHA).toBe("1a2b3c4");

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("SMALL_MODEL_MODE_HEADER", () => {
  it("is a lowercase custom header name", () => {
    expect(SMALL_MODEL_MODE_HEADER).toBe("x-producer-pal-small-model-mode");
  });
});

describe("resolveSmallModelMode", () => {
  it('returns true for "true" regardless of fallback', () => {
    expect(resolveSmallModelMode("true", false)).toBe(true);
    expect(resolveSmallModelMode("true", true)).toBe(true);
  });

  it('returns false for "false" regardless of fallback', () => {
    expect(resolveSmallModelMode("false", true)).toBe(false);
    expect(resolveSmallModelMode("false", false)).toBe(false);
  });

  it("falls back to the global default when the header is absent", () => {
    expect(resolveSmallModelMode(undefined, true)).toBe(true);
    expect(resolveSmallModelMode(undefined, false)).toBe(false);
  });

  it("falls back for an unrecognized value so a stray header can't force a mode", () => {
    expect(resolveSmallModelMode("1", true)).toBe(true);
    expect(resolveSmallModelMode("yes", false)).toBe(false);
    expect(resolveSmallModelMode("", true)).toBe(true);
  });
});

describe("resolveEnabledTools", () => {
  const CONFIGURED = ["ppal-connect", "ppal-read-clip", "ppal-library"];

  it("is a lowercase header name (HTTP headers are matched case-insensitively)", () => {
    expect(DISABLED_TOOLS_HEADER).toBe(DISABLED_TOOLS_HEADER.toLowerCase());
  });

  it("returns the configured set when the header is absent or empty", () => {
    expect(resolveEnabledTools(undefined, CONFIGURED)).toStrictEqual(
      CONFIGURED,
    );
    expect(resolveEnabledTools("", CONFIGURED)).toStrictEqual(CONFIGURED);
    expect(resolveEnabledTools(" , ", CONFIGURED)).toStrictEqual(CONFIGURED);
  });

  it("copies rather than aliasing the configured set", () => {
    // The caller holds the live config.tools array; a request must not be able
    // to hand a mutable reference to it around.
    expect(resolveEnabledTools(undefined, CONFIGURED)).not.toBe(CONFIGURED);
  });

  it("subtracts the named tools", () => {
    expect(resolveEnabledTools("ppal-library", CONFIGURED)).toStrictEqual([
      "ppal-connect",
      "ppal-read-clip",
    ]);
    expect(
      resolveEnabledTools("ppal-library,ppal-read-clip", CONFIGURED),
    ).toStrictEqual(["ppal-connect"]);
  });

  it("tolerates whitespace and stray separators", () => {
    expect(
      resolveEnabledTools(" ppal-library , , ppal-read-clip ", CONFIGURED),
    ).toStrictEqual(["ppal-connect"]);
  });

  it("ignores names the server doesn't offer", () => {
    // A subtraction needs no catalog: an unknown name — a client-side tool, or
    // one from a newer build — is a no-op rather than an error.
    expect(
      resolveEnabledTools("spawn_subagent,ppal-nonesuch", CONFIGURED),
    ).toStrictEqual(CONFIGURED);
  });

  it("can empty the toolset entirely", () => {
    expect(resolveEnabledTools(CONFIGURED.join(","), CONFIGURED)).toStrictEqual(
      [],
    );
  });
});
