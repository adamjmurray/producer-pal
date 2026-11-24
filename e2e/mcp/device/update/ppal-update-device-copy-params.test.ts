// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-update-device copyParamsFrom.
 * Each test builds its own devices on a new track, so nothing here depends on
 * what the Set already holds or on a machine's default track preset.
 * Uses: e2e-test-set (the Producer Pal device on t11)
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-copy-params
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  readIdAtPath,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { PPAL_TRACK } from "../../e2e-test-set.ts";
import { readParam } from "../helpers/device-param-test-helpers.ts";

const ctx = setupMcpTestContext();

interface CopyEntry {
  id: string;
  copied?: { params: number; settings?: string[]; skipped?: string[] };
}

/**
 * Call update-device with the given args.
 * @param args - Tool arguments
 * @returns The raw tool result
 */
async function update(args: Record<string, unknown>): Promise<unknown> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-device",
    arguments: args,
  });

  await sleep(100);

  return result;
}

/**
 * Read a param's value off the device at a path.
 * @param path - The device's path
 * @param name - The param's name
 * @returns The value the read reports
 */
async function valueAt(path: string, name: string): Promise<unknown> {
  const id = await readIdAtPath(ctx.client!, "ppal-read-device", path);

  return (await readParam(ctx.client!, id, name)).value;
}

/**
 * The values of the params these tests change.
 * @param path - The device's path
 * @returns Threshold, Output Gain and Dry/Wet, as read
 */
async function snapshot(path: string): Promise<unknown[]> {
  return [
    await valueAt(path, "Threshold"),
    await valueAt(path, "Output"),
    await valueAt(path, "Dry/Wet"),
  ];
}

/**
 * Put two Compressors on a new track.
 * @returns Their paths
 */
async function twoCompressors(): Promise<{ source: string; target: string }> {
  const track = await createMidiTrack(ctx.client!);
  const source = await createTestDeviceAt(
    ctx.client!,
    "Compressor",
    `t${track}`,
  );
  const target = await createTestDeviceAt(
    ctx.client!,
    "Compressor",
    `t${track}`,
  );

  return { source, target };
}

describe("ppal-update-device copyParamsFrom", () => {
  it("copies the params of one Compressor onto another", async () => {
    const { source, target } = await twoCompressors();

    await update({
      path: source,
      params: [
        { name: "Threshold", value: -30 },
        { name: "Output", value: 3 },
        { name: "Dry/Wet", value: 50 },
      ],
    });

    const sourceValues = await snapshot(source);

    expect(await snapshot(target)).not.toStrictEqual(sourceValues);

    const entry = parseToolResult<CopyEntry>(
      await update({ path: target, copyParamsFrom: source }),
    );

    expect(entry.copied?.params).toBeGreaterThanOrEqual(3);
    expect(entry.copied?.skipped).toBeUndefined();
    expect(await snapshot(target)).toStrictEqual(sourceValues);
  });

  it("names the source by id, and lets params in the same call win", async () => {
    const { source, target } = await twoCompressors();

    await update({ path: source, params: [{ name: "Threshold", value: -30 }] });

    const sourceId = await readIdAtPath(
      ctx.client!,
      "ppal-read-device",
      source,
    );
    const sourceOutput = await valueAt(source, "Output");

    await update({
      path: target,
      copyParamsFrom: sourceId,
      params: [{ name: "Threshold", value: -10 }],
    });

    expect(await valueAt(target, "Threshold")).toBe(-10);
    expect(await valueAt(target, "Output")).toBe(sourceOutput);
  });

  it("refuses a device of another type", async () => {
    const track = await createMidiTrack(ctx.client!);
    const source = await createTestDeviceAt(
      ctx.client!,
      "Compressor",
      `t${track}`,
    );
    const target = await createTestDeviceAt(
      ctx.client!,
      "EQ Eight",
      `t${track}`,
    );

    const result = await update({ path: target, copyParamsFrom: source });

    // copyParamsFrom was the whole call, so the lone device throws its reason.
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "not copied: the source is Compressor, not EQ Eight",
    );
  });

  it("refuses a source that doesn't exist", async () => {
    const track = await createMidiTrack(ctx.client!);
    const target = await createTestDeviceAt(
      ctx.client!,
      "Compressor",
      `t${track}`,
    );

    const result = await update({
      path: target,
      copyParamsFrom: `t${track}/d99`,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `nothing at copyParamsFrom "t${track}/d99"`,
    );
  });

  it("refuses the Producer Pal device as a target", async () => {
    const track = await createMidiTrack(ctx.client!);
    const source = await createTestDeviceAt(
      ctx.client!,
      "Compressor",
      `t${track}`,
    );

    const result = await update({
      path: `t${PPAL_TRACK}/d0`,
      copyParamsFrom: source,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "not copied: the Producer Pal device can't be copied from or onto",
    );
  });

  it("refuses the Producer Pal device as the source", async () => {
    const track = await createMidiTrack(ctx.client!);
    const target = await createTestDeviceAt(
      ctx.client!,
      "Compressor",
      `t${track}`,
    );
    const before = await snapshot(target);

    const result = await update({
      path: target,
      copyParamsFrom: `t${PPAL_TRACK}/d0`,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "not copied: the Producer Pal device can't be copied from or onto",
    );
    expect(await snapshot(target)).toStrictEqual(before);
  });
});
