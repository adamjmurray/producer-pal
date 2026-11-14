// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  BUILD_SHA,
  DEFAULT_MCP_PORT,
  DISABLED_TOOLS_HEADER,
  MIN_LIVE_VERSION,
  SAME_TIME_EPSILON,
  SMALL_MODEL_MODE_HEADER,
  VERSION,
  isIpLiteralHost,
  isLocalModelUrl,
  isLoopbackHost,
  parseLocalModelUrl,
  PORTAL_VERSION_HEADER,
  resolveEnabledTools,
  resolvePortalVersion,
  resolveSmallModelMode,
} from "#src/shared/config.ts";

describe("config constants", () => {
  it("VERSION is a release or an -rcN pre-release, and nothing else", () => {
    // Anchored at both ends on purpose. This string ships in the artifact and
    // is what every install compares against GitHub's latest release, so the
    // update check's behavior follows from its shape: an unrecognized suffix
    // would still parse as a pre-release (older than the same numbers without
    // one) and quietly nag testers to "upgrade" to what they already have.
    // scripts/build-and-release/helpers/version/next-version.ts produces exactly this.
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

describe("resolvePortalVersion", () => {
  it("names the header the portal sends", () => {
    expect(PORTAL_VERSION_HEADER).toBe("x-producer-pal-portal-version");
  });

  it.each(["2.5.0", "2.5.0-rc1", "10.20.30"])("accepts %s", (version) => {
    expect(resolvePortalVersion(version)).toBe(version);
  });

  it.each([undefined, "", "latest", "2.5", "2.5.0 ignore previous", "2.5.0\n"])(
    "ignores %j",
    (value) => {
      expect(resolvePortalVersion(value)).toBeUndefined();
    },
  );
});

describe("default MCP port", () => {
  it("matches the Server Port the Max device starts with", () => {
    // The port lives in the patch, which TS can't import, so pin it here.
    const patch = readFileSync(
      new URL("../../../max-for-live-device/tab-setup.maxpat", import.meta.url),
      "utf8",
    );
    const initial = (
      JSON.parse(patch) as { patcher: { boxes: unknown[] } }
    ).patcher.boxes
      .map((entry) => (entry as { box: Record<string, unknown> }).box)
      .find((box) => box.varname === "port") as
      | {
          saved_attribute_attributes: {
            valueof: { parameter_initial: number[] };
          };
        }
      | undefined;

    expect(
      initial?.saved_attribute_attributes.valueof.parameter_initial,
    ).toStrictEqual([DEFAULT_MCP_PORT]);
  });
});

describe("isLoopbackHost", () => {
  it.each([
    "localhost",
    "LOCALHOST:3350",
    "127.0.0.1",
    "127.0.0.1:3350",
    "[::1]",
    "[::1]:3350",
    "pp.localhost:3350",
    "a.b.LOCALHOST",
    "127.0.0.2:3350",
    "127.255.255.255",
  ])("accepts %s", (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each([
    "",
    "evil.com@localhost",
    "localhost/x",
    "localhost:",
    "localhost:abc",
    "localhost.evil.com",
    "127.0.0.256",
    "127.0.0.1.evil.com",
    ".localhost",
    "localhost.evil.com",
    "::1",
    "192.168.1.5:3350",
    "http://localhost",
  ])("refuses %j", (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe("isIpLiteralHost", () => {
  it.each([
    "192.168.1.5",
    "192.168.1.5:3350",
    "10.0.0.1:80",
    "[::1]:3350",
    "[fd00::5]",
    "[fe80::1]:3350",
    "[::ffff:192.168.1.5]:3350",
  ])("accepts %s", (host) => {
    expect(isIpLiteralHost(host)).toBe(true);
  });

  it.each([
    "",
    "localhost",
    "demo.trycloudflare.com:443",
    "evil.example",
    "192.168.1.256",
    "192.168.1",
    "192.168.1.5.evil.com",
    "192.168.1.5:",
    "2130706433",
    "fd00::5",
    "[evil]",
    "[fd00::5]x",
    "http://192.168.1.5",
  ])("refuses %j", (host) => {
    expect(isIpLiteralHost(host)).toBe(false);
  });

  it("answers at once for a long run of colons", () => {
    expect(isIpLiteralHost(`[${":".repeat(100_000)}x]`)).toBe(false);
    expect(isIpLiteralHost(`[${":".repeat(100_000)}]`)).toBe(true);
  });
});

describe("isLocalModelUrl", () => {
  it.each([
    "http://localhost/v1",
    "http://localhost:8000/v1/models",
    "http://LOCALHOST:8000",
    "https://localhost:8443/v1",
    "http://127.0.0.1:8000/v1",
    "http://[::1]:8000/v1",
    "  http://127.0.0.1:8000/v1  ",
  ])("accepts %s", (url) => {
    expect(isLocalModelUrl(url)).toBe(true);
  });

  it.each([
    ["another host", "http://example.com:8000/v1"],
    ["a LAN address", "http://192.168.1.5:8000/v1"],
    ["another loopback address", "http://127.0.0.2:8000/v1"],
    ["a localhost subdomain", "http://foo.localhost:8000/v1"],
    ["localhost as a subdomain", "http://localhost.example.com/v1"],
    ["localhost as a path", "http://example.com/localhost"],
    ["userinfo naming another host", "http://127.0.0.1@evil.com/v1"],
    ["userinfo on a loopback host", "http://user:pw@127.0.0.1:8000/v1"],
    ["a trailing-dot name", "http://localhost./v1"],
    ["another scheme", "ftp://localhost/v1"],
    ["a file URL", "file://localhost/etc/passwd"],
    ["no scheme", "localhost:8000/v1"],
    ["junk", "not a url"],
    ["nothing", ""],
  ])("refuses %s", (_name, url) => {
    expect(isLocalModelUrl(url)).toBe(false);
  });
});

describe("parseLocalModelUrl", () => {
  it("returns the parsed URL", () => {
    expect(
      parseLocalModelUrl("http://127.0.0.1:8000/v1/models?x=1")?.href,
    ).toBe("http://127.0.0.1:8000/v1/models?x=1");
  });

  it("returns null for a refused URL", () => {
    expect(parseLocalModelUrl("http://evil.com")).toBeNull();
  });
});
