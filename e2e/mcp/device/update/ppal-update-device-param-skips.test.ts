// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for a param write that lands nowhere: it keeps its slot in `params`
 * as `ok: false` with a reason, and warns nowhere. The `actions` arg answers the
 * same way, one entry per action sent.
 *
 * These need a real Live: what a stock param does with a value a mock was told
 * to expect proves nothing.
 *
 * An ambiguous name has its own file (device/params/ppal-device-duplicate-param-name),
 * and a quantized param's options are covered by ppal-update-device-param-plausible-values.
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-param-skips
 */
import { describe, expect, it } from "vitest";
import {
  createGlueCompressor,
  expectParamRefused,
  writeParam,
} from "../helpers/update-device-param-test-helpers";
import {
  createMidiTrack,
  createTestDevice,
  parseToolResultWithWarnings,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-device on a param that lands nowhere", () => {
  it("reports a name that reached no parameter", async () => {
    const deviceId = await createGlueCompressor(ctx.client!);
    const written = await writeParam(ctx.client!, deviceId, "Nope", "1");

    // The device path carries its index, which varies per machine, so match the
    // shape rather than the text.
    expectParamRefused(written, "Nope", "not found on t0/d");
  });

  it("reports a value it could not read as a number", async () => {
    const deviceId = await createGlueCompressor(ctx.client!);
    const written = await writeParam(
      ctx.client!,
      deviceId,
      "Threshold",
      "loud",
    );

    expectParamRefused(
      written,
      "Threshold",
      'could not interpret "loud" as a value',
    );
  });

  // The two channels used to disagree: the written param came back in `params`
  // and the other one only in a warning, so a caller pairing the list against
  // its own request came up a name short.
  it("reports both params when only one of them lands", async () => {
    const deviceId = await createGlueCompressor(ctx.client!);
    const { data, warnings } = parseToolResultWithWarnings<{
      params?: Array<{
        id?: string;
        name: string;
        value?: number | string;
        ok?: boolean;
        reason?: string;
      }>;
    }>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: {
          id: deviceId,
          params: [
            { name: "Threshold", value: "-18 dB" },
            { name: "Nope", value: "1" },
          ],
        },
      }),
    );

    await sleep(100);

    expect(data.params).toStrictEqual([
      { id: expect.any(String), name: "Threshold", value: -18 },
      {
        name: "Nope",
        ok: false,
        reason: expect.stringContaining("not found on t0/d"),
      },
    ]);
    expect(warnings).toStrictEqual([]);
  });
});

// A specialized pseudo-param is a device property, not a DeviceParameter, so a
// refusal takes its own path to the same entry. EQ Eight carries both shapes a
// device spec checks most; an integer range is covered by
// ppal-specialized-devices' pitchBendRange.
describe("ppal-update-device on a pseudo-param the device refused", () => {
  it("reports an enum label the device has no option for", async () => {
    const deviceId = await createTestDevice(ctx.client!, "EQ Eight", "t0");
    const written = await writeParam(
      ctx.client!,
      deviceId,
      "globalMode",
      "quad",
    );

    expectParamRefused(written, "globalMode", "is not a valid globalMode");
  });

  it("reports a boolean it could not read as true or false", async () => {
    const deviceId = await createTestDevice(ctx.client!, "EQ Eight", "t0");
    const written = await writeParam(
      ctx.client!,
      deviceId,
      "oversample",
      "sometimes",
    );

    expectParamRefused(written, "oversample", "expected true/false");
  });
});

/** One entry of the `actions` an update-device result reports. */
interface ActionEntry {
  action: string;
  ok?: false;
  reason?: string;
}

/** Create an instrument on a fresh MIDI track; returns the device id. */
async function createInstrument(deviceName: string): Promise<string> {
  const trackIndex = await createMidiTrack(ctx.client!);

  return createTestDevice(ctx.client!, deviceName, `t${trackIndex}`);
}

/** Send actions to a device and return the entries they answered with. */
async function sendActions(
  id: string,
  actions: string[],
): Promise<{ entries: ActionEntry[] | undefined; warnings: string[] }> {
  const { data, warnings } = parseToolResultWithWarnings<{
    actions?: ActionEntry[];
  }>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id, actions },
    }),
  );

  await sleep(100);

  return { entries: data.actions, warnings };
}

describe("ppal-update-device actions", () => {
  it("answers per action sent: one that ran, a no-op, bad args, unknown", async () => {
    const id = await createInstrument("Wavetable");

    const { entries, warnings } = await sendActions(id, [
      "addModulationTarget('Flt 1 Freq')",
      "addModulationTarget('Flt 1 Freq')",
      "setModulation('Flt 1 Freq','LFO 1')",
      "reverse",
    ]);

    // The second add has nothing left to do, so it keeps a normal entry with a
    // reason and no `ok`; only the last two are refusals.
    expect(entries).toStrictEqual([
      { action: "addModulationTarget('Flt 1 Freq')" },
      {
        action: "addModulationTarget('Flt 1 Freq')",
        reason: 'parameter "Flt 1 Freq" is already in the modulation matrix',
      },
      {
        action: "setModulation('Flt 1 Freq','LFO 1')",
        ok: false,
        reason: "requires 3 arguments (target, source, amount)",
      },
      {
        action: "reverse",
        ok: false,
        reason: "unknown action for this device",
      },
    ]);
    expect(warnings).toStrictEqual([]);
  });

  it("reports a sample edit that ran beside one with a bad argument", async () => {
    const id = await createInstrument("Simpler");

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id, params: [{ name: "sample", value: SAMPLE_FILE }] },
    });
    await sleep(100);

    const { entries, warnings } = await sendActions(id, [
      "reverse",
      "warpAs(soon)",
    ]);

    expect(entries).toStrictEqual([
      { action: "reverse" },
      {
        action: "warpAs(soon)",
        ok: false,
        reason: "requires a numeric beats argument",
      },
    ]);
    expect(warnings).toStrictEqual([]);
  });
});
