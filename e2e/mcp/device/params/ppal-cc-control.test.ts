// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for CC Control, whose members Max's Live API can't list: no name,
 * no on/off state, no parameter list. Its params still answer by index, so
 * Mod Wheel reads, updates and takes a clip envelope. The remote script adds
 * the name and on/off state, and writes the envelope.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- device/params/ppal-cc-control
 * The remote script cases: npm run e2e:mcp:remote-script -- device/params/ppal-cc-control
 */
import { describe, expect, it } from "vitest";
import { resolveRemoteScriptPort } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  type ClipEnvelopeResult,
  createTestDeviceAt,
  parseToolResult,
  type ReadClipResult,
  setConfig,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import {
  ENVELOPE_WRITE_NEEDS,
  skipBeforeLive,
} from "../../workflow/helpers/server-capability-test-helpers.ts";
import { createClipInSlot } from "../../clip/helpers/ppal-clip-transforms-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers.ts";
import { readParam } from "../helpers/device-param-test-helpers.ts";

const TRACK = `t${String(EMPTY_MIDI_TRACK)}`;

interface ReadDeviceResult {
  id: string;
  type: string;
  name?: string;
  deactivated?: boolean;
  parameters?: Array<{ id: string; name: string }>;
}

const ctx = setupMcpTestContext();

/**
 * Put a CC Control on the empty MIDI track.
 * @returns Its path
 */
async function createCcControl(): Promise<string> {
  return await createTestDeviceAt(ctx.client!, "CC Control", TRACK);
}

/**
 * Read a CC Control with its params.
 * @param path - The device's path
 * @returns What ppal-read-device gave
 */
async function readCcControl(path: string): Promise<ReadDeviceResult> {
  return parseToolResult<ReadDeviceResult>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["params"] },
    }),
  );
}

/**
 * Set Mod Wheel.
 * @param path - The device's path
 * @param value - The value to set
 */
async function setModWheel(path: string, value: string): Promise<void> {
  const result = parseToolResult<{ params?: unknown[] }>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path, params: [{ name: "Mod Wheel", value }] },
    }),
  );

  expect(result.params).toHaveLength(1);
}

describe("CC Control without the remote script", () => {
  it("reads as a MIDI effect with its params, and no name or on/off state", async () => {
    await setConfig({ remoteScriptEnabled: false });
    const path = await createCcControl();
    const device = await readCcControl(path);

    expect(device.type).toBe("midi-effect: CC Control");
    expect(device.name).toBeUndefined();
    expect(device.deactivated).toBeUndefined();
    expect(device.parameters?.map((param) => param.name)).toContain(
      "Mod Wheel",
    );
  });

  it("updates Mod Wheel and reads it back", async () => {
    await setConfig({ remoteScriptEnabled: false });
    const path = await createCcControl();
    const deviceId = (await readCcControl(path)).id;

    await setModWheel(path, "64");
    await sleep(100);

    expect((await readParam(ctx.client!, deviceId, "Mod Wheel")).value).toBe(
      64,
    );
  });
});

describe.skipIf(!REMOTE_SCRIPT_E2E)("CC Control with the remote script", () => {
  requireRemoteScript();

  skipBeforeLive(ctx, "12.4", ENVELOPE_WRITE_NEEDS);

  it("reads without a name and not deactivated while it is on and unrenamed", async () => {
    const device = await readCcControl(await createCcControl());

    expect(device.type).toBe("midi-effect: CC Control");
    expect(device.name).toBeUndefined();
    expect(device.deactivated).toBeUndefined();
  });

  it("answers its name and on/off state from /device/basics", async () => {
    const path = await createCcControl();
    const livePath = `live_set tracks ${String(EMPTY_MIDI_TRACK)} devices ${path.split("/d")[1]}`;
    const response = await fetch(
      `http://127.0.0.1:${String(await resolveRemoteScriptPort())}/device/basics`,
      { method: "POST", body: JSON.stringify({ device_paths: [livePath] }) },
    );

    expect(await response.json()).toStrictEqual({
      devices: [{ name: "CC Control", is_active: true }],
    });
  });

  it("writes a Mod Wheel clip envelope and reads it back", async () => {
    const path = await createCcControl();
    const modWheel = (await readCcControl(path)).parameters?.find(
      (param) => param.name === "Mod Wheel",
    );

    expect(modWheel).toBeDefined();

    const clipId = await createClipInSlot(ctx, `${TRACK}/s0`, {
      notes: "C3 1|1",
      length: "4bar",
    });
    const written = parseToolResult<UpdateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id: clipId, envelopes: `${modWheel?.id}: 1|1 0 / 3|1 64` },
      }),
    );

    expect(written).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    await sleep(100);

    const { envelopes } = parseToolResult<ReadClipResult>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: clipId, include: ["envelopes"] },
      }),
    );

    expect(envelopes).toHaveLength(1);
    expect((envelopes as ClipEnvelopeResult[])[0]).toStrictEqual(
      expect.objectContaining({
        parameter: expect.stringContaining("Mod Wheel") as string,
        events: expect.stringMatching(/^1\|1 0.*\/ 3\|1 64/) as string,
      }),
    );
  });
});
