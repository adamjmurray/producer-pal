// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for addressing a device param by its own `id` field.
 *
 * Run with: npm run e2e:mcp -- device/params/ppal-device-param-id-field
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  getToolErrorMessage,
  isToolError,
  setupMcpTestContext,
} from "../../mcp-test-helpers";
import {
  callForParams,
  readParam,
} from "../helpers/device-param-test-helpers.ts";

const ctx = setupMcpTestContext();

/**
 * @returns A fresh Glue Compressor's id and its Threshold param
 */
async function glueWithThreshold(): Promise<{
  deviceId: string;
  thresholdId: string;
  value: unknown;
}> {
  const deviceId = await createTestDevice(ctx.client!, "Glue Compressor", "t0");
  const threshold = await readParam(ctx.client!, deviceId, "Threshold");

  return {
    deviceId,
    thresholdId: threshold.id as string,
    value: threshold.value,
  };
}

describe("ppal-update-device params addressed by id", () => {
  it("writes the param and reports its id and name", async () => {
    const { deviceId, thresholdId } = await glueWithThreshold();

    const { entries } = await callForParams(ctx.client!, "ppal-update-device", {
      id: deviceId,
      params: [{ id: thresholdId, value: "-12" }],
    });

    // The param took the number asked for, so the entry only names it — the
    // read is what proves the write landed.
    expect(entries).toStrictEqual([{ id: thresholdId, name: "Threshold" }]);
    expect((await readParam(ctx.client!, deviceId, "Threshold")).value).toBe(
      -12,
    );
  });

  // The OpenAI models fill the field they don't use with "".
  it("treats a blank name beside an id as absent", async () => {
    const { deviceId, thresholdId } = await glueWithThreshold();

    const { entries } = await callForParams(ctx.client!, "ppal-update-device", {
      id: deviceId,
      params: [{ name: "", id: thresholdId, value: "-9" }],
    });

    expect(entries).toStrictEqual([{ id: thresholdId, name: "Threshold" }]);
    expect((await readParam(ctx.client!, deviceId, "Threshold")).value).toBe(
      -9,
    );
  });

  it("reports a miss under the id the call sent", async () => {
    const { deviceId } = await glueWithThreshold();

    const { entries, warnings } = await callForParams(
      ctx.client!,
      "ppal-update-device",
      {
        id: deviceId,
        params: [
          { id: "N/A", value: "-9" },
          { name: "Threshold", value: "-9" },
        ],
      },
    );

    expect(entries).toStrictEqual([
      { id: "N/A", ok: false, detail: expect.stringMatching(/^not found on /) },
      { id: expect.any(String), name: "Threshold" },
    ]);
    expect(warnings).toStrictEqual([]);
  });

  it("refuses an entry with both a name and an id", async () => {
    const { deviceId, thresholdId, value } = await glueWithThreshold();

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        id: deviceId,
        params: [{ name: "Threshold", id: thresholdId, value: "-6" }],
      },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("both a name");
    expect((await readParam(ctx.client!, deviceId, "Threshold")).value).toBe(
      value,
    );
  });
});
