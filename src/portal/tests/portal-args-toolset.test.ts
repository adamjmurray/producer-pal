// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { ALL_TOOL_IDS, CONNECT_TOOL_ID } from "#src/shared/tool-groups.ts";
import { parsePortalArgs } from "../portal-args.ts";

vi.mock(import("../file-logger.ts"), () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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
      "ppal-read-device",
      "ppal-create-device",
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

  // An older npx-cached portal must still be able to withhold a tool the
  // device added after it was cached, so an unrecognized name is forwarded
  // rather than dropped. Known names keep catalog order; forwarded ones follow.
  it("forwards an unknown name to the device instead of dropping it", () => {
    expect(disabledFor(["--disable-tools", "nonesuch,library"])).toStrictEqual([
      "ppal-library",
      "ppal-nonesuch",
    ]);
  });

  it("adds the ppal- prefix to a forwarded name", () => {
    expect(disabledFor(["--disable-tools", "ppal-nonesuch"])).toStrictEqual([
      "ppal-nonesuch",
    ]);
  });

  it("starts rather than failing when every name is unknown", () => {
    expect(disabledFor(["--disable-tools", "nope,alsonope"])).toStrictEqual([
      "ppal-nope",
      "ppal-alsonope",
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
        "ppal-read-clip",
        "ppal-create-clip",
        "ppal-update-clip",
        "ppal-read-track",
        "ppal-create-track",
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

  // The other half of the asymmetry: a whitelist withholds by complement, and
  // a name this build doesn't know can't be in one — so unlike --disable-tools,
  // there is nothing useful to forward.
  it("skips an unknown name rather than forwarding it", () => {
    expect(disabledFor(["--tools", "clip,nonesuch"])).not.toContain(
      "ppal-nonesuch",
    );
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
  it("applies them", () => {
    expect(disabledFor([], { DISABLE_TOOLS: "device" })).toStrictEqual([
      "ppal-read-device",
      "ppal-create-device",
      "ppal-update-device",
    ]);
  });

  it("prefers the flags over the env vars", () => {
    expect(
      disabledFor(["--disable-tools", "library"], {
        DISABLE_TOOLS: "device",
      }),
    ).toStrictEqual(["ppal-library"]);
  });

  it("treats a blank TOOLS as no override, like the extension's default", () => {
    expect(disabledFor([], { TOOLS: "" })).toBeUndefined();
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
