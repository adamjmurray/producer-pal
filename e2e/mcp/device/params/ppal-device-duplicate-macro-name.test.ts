// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for two rack macros renamed the same — the realistic way a caller
 * meets a repeated param name. Unlike Corpus's two `Width`s, only the raw
 * names collide here: `original_name` still differs, so the
 * `name (original_name)` form read-device reports picks one out, and the
 * caller never needs an id. A macro can only be renamed by hand in Live (the
 * Live API acks a name write and ignores it), so the rename is baked into
 * racks-test. See e2e/live-sets/racks-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- device/params/ppal-device-duplicate-macro-name
 */
import { describe, expect, it } from "vitest";
import {
  getToolWarnings,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers.ts";
import { RACKS_TEST_PATH } from "../helpers/racks-test-helpers.ts";

/** The Instrument Rack whose Macro 1 and Macro 2 are both named "Drive". */
const OUTER = "t0/d0";

interface ParamInfo {
  id: string;
  name: string;
  value?: number | string;
}

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

/**
 * Read the "Outer" rack's two identically-named macros.
 * @returns The matching params, in device order
 */
async function readDrives(): Promise<ParamInfo[]> {
  const device = parseToolResult<{ parameters?: ParamInfo[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: OUTER, include: ["params", "param-values"] },
    }),
  );

  return (device.parameters ?? []).filter((param) =>
    param.name.startsWith("Drive"),
  );
}

describe("a rack with two macros renamed the same", () => {
  it("names them apart by original_name", async () => {
    expect((await readDrives()).map((param) => param.name)).toStrictEqual([
      "Drive (Macro 1)",
      "Drive (Macro 2)",
    ]);
  });

  it("writes neither when addressed by the name they share", async () => {
    const before = await readDrives();
    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: OUTER, params: [{ name: "Drive", value: "42" }] },
    });
    const warning = getToolWarnings(result).find((text) =>
      text.includes('param "Drive" names 2 params'),
    );

    expect(warning, "no ambiguous-name warning").toBeDefined();

    for (const param of before) {
      expect(warning).toContain(`id ${param.id}`);
    }

    expect(await readDrives()).toStrictEqual(before);
  });

  it("writes the one named the way read-device reports it", async () => {
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        path: OUTER,
        params: [{ name: "Drive (Macro 2)", value: "42" }],
      },
    });

    const [macro1, macro2] = await readDrives();

    expect(macro2?.value).toBe(42);
    expect(macro1?.value).not.toBe(42);
  });

  it("matches that name case-insensitively", async () => {
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        path: OUTER,
        params: [{ name: "drive (macro 1)", value: "99" }],
      },
    });

    expect((await readDrives())[0]?.value).toBe(99);
  });
});
