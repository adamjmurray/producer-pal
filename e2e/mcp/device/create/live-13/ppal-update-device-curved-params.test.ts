// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E test for a param whose display matches its raw range only at the ends.
 * Looplet's Volume 1-4 run raw -70..6 and read "-inf dB".."6.0 dB", but raw
 * -12 reads 0.1 dB, not -12. A write of -12 must find the raw value that reads
 * -12 dB instead of sending -12 straight through.
 *
 * Live 13 only (Looplet ships with it): the suite skips on Live 12.
 *
 * Run with: npm run e2e:mcp -- device/create/live-13/ppal-update-device-curved-params
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDevice,
  type McpTestContext,
  setupMcpTestContext,
  sleep,
} from "../../../mcp-test-helpers";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../../e2e-test-set.ts";
import {
  callForParams,
  readParam,
} from "../../helpers/device-param-test-helpers.ts";

// Set inside the describe, so nothing opens the Live 13 Set on Live 12.
let ctx: McpTestContext;

describe.skipIf(!LIVE_13_OR_NEWER)("curved params (Live 13)", () => {
  ctx = setupMcpTestContext({ once: true, liveSetPath: LIVE_13_TEST_PATH });

  it("writes Looplet's Volume 2 so it reads the dB asked for", async () => {
    const id = await createTestDevice(
      ctx.client!,
      "Looplet",
      `t${await createMidiTrack(ctx.client!)}`,
    );

    for (const target of [-12, -6, 2]) {
      const { entries } = await callForParams(
        ctx.client!,
        "ppal-update-device",
        {
          id,
          params: [{ name: "Volume 2", value: String(target) }],
        },
      );

      await sleep(100);

      const { value } = await readParam(ctx.client!, id, "Volume 2");

      // Labels round to 0.1 dB.
      expect(Math.abs(Number(value) - target)).toBeLessThanOrEqual(0.5);
      // A write that landed where asked reports no "read back as shown".
      expect(entries).toHaveLength(1);
      expect(entries[0]?.detail ?? "").not.toContain("read back as shown");
    }
  });
});
