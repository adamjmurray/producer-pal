// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { ALL_TOOL_IDS, CONNECT_TOOL_ID } from "#src/shared/tool-groups.ts";
import { parsePortalArgs } from "./portal-args.ts";

vi.mock(import("./file-logger.ts"), () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const GATE_ON = { ALLOW_CONFIGURATION_OVERRIDES: "true" };

/**
 * Parse and return just the withheld tools.
 * @param args - CLI arguments
 * @param env - Environment, defaulting to none
 * @returns The disabledTools bridge option, if set
 */
function disabledFor(
  args: string[],
  env: Record<string, string | undefined> = {},
): string[] | undefined {
  return parsePortalArgs(args, env).bridgeOptions.disabledTools;
}

/**
 * The complement of a kept set over the full catalog, minus the always-kept
 * entry point — what `--tools` is expected to produce.
 * @param kept - Tool names the caller asked to keep
 * @returns The expected disabled list
 */
function complementOf(kept: string[]): string[] {
  const keep = new Set([...kept, CONNECT_TOOL_ID]);

  return ALL_TOOL_IDS.filter((name) => !keep.has(name));
}

describe("--disable-tools", () => {
  it("withholds the named tools", () => {
    expect(
      disabledFor(["--disable-tools", "library,read-device"]),
    ).toStrictEqual(["ppal-library", "ppal-read-device"]);
  });

  it("expands a group alias", () => {
    expect(disabledFor(["--disable-tools=device"])).toStrictEqual([
      "ppal-create-device",
      "ppal-read-device",
      "ppal-update-device",
    ]);
  });

  it("withholds the Direct Live API tool per client", () => {
    // The asymmetry: enabling the tool stays device-global (the header only
    // subtracts), but withholding it is per client.
    expect(disabledFor(["--disable-tools", "advanced"])).toStrictEqual([
      "ppal-live-api",
    ]);
  });

  it("skips an unknown name instead of failing to start", () => {
    expect(disabledFor(["--disable-tools", "nonesuch,library"])).toStrictEqual([
      "ppal-library",
    ]);
  });

  it("reports nothing withheld for a blank value", () => {
    expect(disabledFor(["--disable-tools", ""])).toBeUndefined();
  });
});

describe("--tools", () => {
  it("withholds the complement of the requested set", () => {
    expect(disabledFor(["--tools", "clip,track"])).toStrictEqual(
      complementOf([
        "ppal-create-clip",
        "ppal-read-clip",
        "ppal-update-clip",
        "ppal-create-track",
        "ppal-read-track",
        "ppal-update-track",
      ]),
    );
  });

  it("complements over the full catalog, so ppal-live-api is withheld too", () => {
    // Complementing TOOL_NAMES instead would leave it enabled on a device with
    // the Direct Live API flag on.
    expect(disabledFor(["--tools", "clip"])).toContain("ppal-live-api");
  });

  it("keeps ppal-connect even when the request omits it", () => {
    expect(disabledFor(["--tools", "clip"])).not.toContain(CONNECT_TOOL_ID);
  });

  it("keeps ppal-connect even when --disable-tools names it", () => {
    expect(disabledFor(["--disable-tools", "connect,core"])).toStrictEqual([
      "ppal-context",
    ]);
  });

  it("applies --disable-tools after --tools", () => {
    expect(
      disabledFor(["--tools", "clip", "--disable-tools", "update-clip"]),
    ).toStrictEqual(complementOf(["ppal-create-clip", "ppal-read-clip"]));
  });

  it("withholds nothing when the flag is absent", () => {
    expect(disabledFor([])).toBeUndefined();
  });

  it("resolves read-only to the reading tools only", () => {
    const disabled = disabledFor(["--tools", "read-only"]) ?? [];

    expect(disabled).not.toContain("ppal-read-clip");
    expect(disabled).toContain("ppal-create-clip");
    expect(disabled).toContain("ppal-update-clip");
    expect(disabled).toContain("ppal-delete");
    expect(disabled).toContain("ppal-duplicate");
  });
});

describe("TOOLS / DISABLE_TOOLS env vars", () => {
  it("ignores them when the override gate is off", () => {
    expect(
      disabledFor([], { TOOLS: "clip", DISABLE_TOOLS: "library" }),
    ).toBeUndefined();
  });

  it("applies them when the gate is on", () => {
    expect(
      disabledFor([], { ...GATE_ON, DISABLE_TOOLS: "device" }),
    ).toStrictEqual([
      "ppal-create-device",
      "ppal-read-device",
      "ppal-update-device",
    ]);
  });

  it("prefers the flags over the env vars", () => {
    expect(
      disabledFor(["--disable-tools", "library"], {
        ...GATE_ON,
        DISABLE_TOOLS: "device",
      }),
    ).toStrictEqual(["ppal-library"]);
  });

  it("treats a blank TOOLS as no override, like the extension's default", () => {
    expect(disabledFor([], { ...GATE_ON, TOOLS: "" })).toBeUndefined();
  });
});

describe("--list-tools", () => {
  it("is off by default", () => {
    expect(parsePortalArgs([], {}).listTools).toBe(false);
  });

  it("is requested by the flag", () => {
    expect(parsePortalArgs(["--list-tools"], {}).listTools).toBe(true);
  });
});
