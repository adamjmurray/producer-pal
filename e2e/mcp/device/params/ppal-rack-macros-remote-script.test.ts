// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for which rack macros are mapped, which only the Producer Pal
 * remote script can say: ppal-read-device names them, and ppal-update-device's
 * `macroCount` names the mapped ones it hides. Opt-in like the other remote
 * script suites.
 *
 * Uses: racks-test — t0/d0/c0/d0 is the "Kit" Drum Rack with macros 1-7
 * mapped. The visible count is read at run time, and put back after each test.
 * See: e2e/live-sets/racks-test-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- device/params/ppal-rack-macros-remote-script
 */
import { afterEach, describe, expect, it } from "vitest";
import { RACKS_TEST_PATH } from "../../e2e-test-set.ts";
import {
  parseToolResult,
  resetConfig,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers.ts";

/** The Drum Rack with macros 1-7 mapped. */
const KIT = "t0/d0/c0/d0";

/** The macros the Set maps. */
const MAPPED = [1, 2, 3, 4, 5, 6, 7];

interface Macros {
  count: number;
  hasMappings?: boolean;
  mapped?: number[];
  hiddenMapped?: number[];
}

describe.skipIf(!REMOTE_SCRIPT_E2E)("rack macros: which are mapped", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

  afterEach(async () => {
    await resetConfig();
  });

  /**
   * Read the Kit's macros.
   * @returns The rack's `macros`
   */
  async function readMacros(): Promise<Macros> {
    await sleep(150);

    const kit = parseToolResult<{ macros?: Macros }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: KIT, include: ["params"] },
      }),
    );

    return kit.macros!;
  }

  /**
   * Set the Kit's macro count.
   * @param macroCount - The count to ask for
   * @returns The entry's `detail`, if any
   */
  async function setCount(macroCount: number): Promise<string | undefined> {
    const entry = parseToolResult<{ detail?: string }>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: KIT, macroCount },
      }),
    );

    return entry.detail;
  }

  /**
   * Lower the count to `target`, and put it back whatever happens.
   * @param target - The even count to lower to
   * @returns The entry's detail, the count before, and the count lowered to
   */
  async function lowerAndRestore(
    target: number,
  ): Promise<{ detail?: string; before: number; lowered: number }> {
    const before = (await readMacros()).count;

    // A Drum Rack with 7 mapped macros shows at least 8.
    expect(before).toBeGreaterThan(target);

    try {
      const detail = await setCount(target);

      return { detail, before, lowered: (await readMacros()).count };
    } finally {
      await setCount(before);
      // Hiding keeps the mappings, so the count is the only thing to put back.
      expect((await readMacros()).count).toBe(before);
    }
  }

  it("names the mapped macros, hidden ones apart", async () => {
    const { count, mapped, hiddenMapped, hasMappings } = await readMacros();

    expect(hasMappings).toBeUndefined();
    expect(mapped).toStrictEqual(MAPPED.filter((n) => n <= count));

    const hidden = MAPPED.filter((n) => n > count);

    expect(hiddenMapped).toStrictEqual(hidden.length > 0 ? hidden : undefined);
  });

  it("names the mapped macros a lowered count hid, and says their mappings are kept", async () => {
    const { detail, lowered } = await lowerAndRestore(4);

    expect(lowered).toBe(4);
    expect(detail).toBe("macros 5, 6 and 7 hidden; their mappings are kept");
  });

  it("still maps the hidden macros, and reads them as hidden", async () => {
    const before = (await readMacros()).count;

    try {
      await setCount(4);

      const lowered = await readMacros();

      expect(lowered.mapped).toStrictEqual([1, 2, 3, 4]);
      expect(lowered.hiddenMapped).toStrictEqual([5, 6, 7]);
    } finally {
      await setCount(before);
    }

    expect((await readMacros()).mapped).toStrictEqual(
      MAPPED.filter((n) => n <= before),
    );
  });

  it("falls back to saying there are mappings while the remote script is off", async () => {
    await setConfig({ remoteScriptEnabled: false });

    const macros = await readMacros();

    expect(macros.hasMappings).toBe(true);
    expect(macros.mapped).toBeUndefined();
  });

  it("says the hidden macros keep any mappings while the remote script is off", async () => {
    await setConfig({ remoteScriptEnabled: false });

    const { detail, before } = await lowerAndRestore(4);

    expect(detail).toBe(
      `macros 5 to ${String(before)} hidden; any mappings on them are kept`,
    );
  });
});
