// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for VST3 plug-ins hosted in a Producer Pal wrapper. Uses Serum 2
 * (one VST3 file holding the "Serum 2" instrument and the "Serum 2 FX" effect),
 * so it skips on a machine without it.
 *
 * Opt-in: needs a build with hosting on (`ENABLE_HOSTED_PLUGINS=true npm run
 * build:debug`), the wrappers installed (`npm run install:plugin-host`), and
 * the remote script.
 *
 * Duplicating a track stands in for a Set reload: the copy's wrapper starts
 * fresh, with only what Live saved for it.
 *
 * The automation slot tests also use ppal-live-api and ppal-plugin-host, which
 * the suite turns on per test. Hosted params are automated by device path and
 * `h` id (`t3/d0/h1`), which maps an automation slot to the param.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: ENABLE_HOSTED_PLUGINS=true npm run e2e:mcp:remote-script -- device/create/ppal-create-device-hosted
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createMidiTrack,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

const SERUM_FILE = "Serum2.vst3";
const HAS_SERUM = [
  "/Library/Audio/Plug-Ins/VST3",
  join(homedir(), "Library/Audio/Plug-Ins/VST3"),
].some((folder) => existsSync(join(folder, SERUM_FILE)));

// A duplicated wrapper restores its plug-in a moment after it appears.
const RESTORE_MS = 3000;

// Live closes an undo step after about this long without a change.
const UNDO_SETTLE_MS = 5000;

interface EnvelopeEntry {
  parameter: string;
  id: string;
  slot?: string;
}

interface HostedDevice {
  id: string;
  path: string;
  type: string;
  hosted?: boolean;
  name?: string;
  parameters?: { id: string; name: string; value?: string }[];
}

describe.skipIf(
  !REMOTE_SCRIPT_E2E ||
    process.env.ENABLE_HOSTED_PLUGINS !== "true" ||
    !HAS_SERUM,
)("hosted plug-ins", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();

  /**
   * Call a tool and parse its result.
   * @param name - Tool name
   * @param args - Tool args
   * @returns The parsed result
   */
  async function call<T>(name: string, args: Record<string, unknown>) {
    return parseToolResult<T>(
      await ctx.client!.callTool({ name, arguments: args }),
    );
  }

  /**
   * Host a plug-in at the end of a new MIDI track.
   * @param deviceName - The plug-in's name in Live's browser
   * @param extra - More create-device args
   * @returns The track index and the device's path
   */
  async function hostOnNewTrack(
    deviceName: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ track: number; path: string }> {
    const track = await createMidiTrack(ctx.client!);
    const created = await call<{ path: string }>("ppal-create-device", {
      deviceName,
      hosted: true,
      path: `t${track}/d+`,
      ...extra,
    });

    return { track, path: created.path };
  }

  /**
   * Read a device's params whose names match.
   * @param path - The device's path
   * @param paramSearch - Name filter
   * @returns The device
   */
  function readDevice(path: string, paramSearch?: string) {
    return call<HostedDevice>("ppal-read-device", {
      path,
      ...(paramSearch && { include: ["param-values"], paramSearch }),
    });
  }

  /**
   * Duplicate a track and wait for its wrappers to restore their plug-ins.
   * @param track - Track index
   * @returns The copy's path
   */
  async function duplicateTrack(track: number): Promise<string> {
    const copy = await call<{ path: string }>("ppal-duplicate", {
      type: "track",
      path: `t${track}`,
    });

    await sleep(RESTORE_MS);

    return copy.path;
  }

  it("reads an instrument as the plug-in, with its own params", async () => {
    const { path } = await hostOnNewTrack("Serum 2");
    const device = await readDevice(path, "Main Vol");

    expect(device).toStrictEqual({
      id: expect.any(String),
      path,
      type: "instrument: Serum 2",
      hosted: true,
      parameters: expect.arrayContaining([
        { id: "h1", name: "Main Vol", value: expect.any(String) },
      ]),
    });
  });

  it("sets a param by its display text", async () => {
    const { path } = await hostOnNewTrack("Serum 2");

    await call("ppal-update-device", {
      path,
      params: [{ name: "Main Vol", value: "25%" }],
    });

    const [param] = (await readDevice(path, "Main Vol")).parameters ?? [];

    expect(param?.value).toMatch(/^25%/);
  });

  it("keeps the plug-in's name under a custom name after a reload", async () => {
    const { track } = await hostOnNewTrack("Serum 2 FX", { name: "My FX" });
    const copy = await duplicateTrack(track);
    const devices =
      (
        await call<{ devices?: HostedDevice[] }>("ppal-read-track", {
          path: copy,
          include: ["devices"],
        })
      ).devices ?? [];

    expect(devices.at(-1)).toStrictEqual({
      id: expect.any(String),
      path: expect.any(String),
      type: "audio-effect: Serum 2 FX",
      hosted: true,
      name: "My FX",
    });
  });

  it("keeps the plug-in's settings after a reload", async () => {
    const { track, path } = await hostOnNewTrack("Serum 2");

    await call("ppal-update-device", {
      path,
      params: [{ name: "Main Vol", value: "25%" }],
    });

    const copy = await duplicateTrack(track);
    const devicePath = `${copy}/${path.split("/").at(-1)}`;
    const [param] = (await readDevice(devicePath, "Main Vol")).parameters ?? [];

    expect(param?.value).toMatch(/^25%/);
  });

  describe("automation slots", () => {
    beforeEach(async () => {
      await setConfig({ liveApiEnabled: true });
    });

    /**
     * Run ppal-live-api operations.
     * @param path - The LiveAPI path
     * @param operations - The operations to run
     * @returns One result per operation
     */
    async function liveApi(
      path: string,
      operations: unknown[],
    ): Promise<unknown[]> {
      return (
        await call<{ results: unknown[] }>("ppal-live-api", {
          path,
          operations,
        })
      ).results;
    }

    /**
     * Find a wrapper's automation dial by its Live parameter name.
     * @param deviceId - The wrapper's Live device id
     * @param dialName - e.g. "Automation 001"
     * @returns The dial's parameter id, as ppal-update-clip envelopes take it
     */
    async function findDial(
      deviceId: string,
      dialName: string,
    ): Promise<string> {
      const [children] = (await liveApi(`id ${deviceId}`, [
        { type: "get-child-ids", property: "parameters" },
      ])) as [string[]];

      for (const child of children) {
        const [name] = await liveApi(child, [
          { type: "get-property", property: "name" },
        ]);

        if (name === dialName) {
          return child.replace("id ", "");
        }
      }

      throw new Error(`no parameter named ${dialName}`);
    }

    /**
     * Read the hosted plug-in's "Main Vol" through the wrapper.
     * @param deviceId - The wrapper's Live device id
     * @returns Its value, 0..1
     */
    async function mainVolume(deviceId: string): Promise<number> {
      const { params } = await call<{ params: { value: number }[] }>(
        "ppal-plugin-host",
        { deviceId, action: "params", names: ["Main Vol"] },
      );

      return Number(params[0]?.value);
    }

    /**
     * Wait (up to 6 s) for the plug-in's "Main Vol" to reach a value.
     * @param deviceId - The wrapper's Live device id
     * @param wanted - The value, 0..1
     * @returns Its last value, 0..1
     */
    async function waitForMainVolume(
      deviceId: string,
      wanted: number,
    ): Promise<number> {
      let value = Number.NaN;

      for (let attempt = 0; attempt < 30; attempt++) {
        value = await mainVolume(deviceId);

        if (Math.abs(value - wanted) < 0.01) {
          break;
        }

        await sleep(200);
      }

      return value;
    }

    it("maps a slot, and clip automation on its dial moves the plug-in without undo steps", async () => {
      const { track, path } = await hostOnNewTrack("Serum 2");
      const deviceId = (await readDevice(path)).id;
      const slot = { deviceId, action: "map", slot: 1, name: "Main Vol" };

      expect(await call("ppal-plugin-host", slot)).toStrictEqual(
        expect.objectContaining({
          slot: 1,
          name: "Main Vol",
          dialSet: true,
        }),
      );

      // Mapping the same param again changes nothing.
      expect(await call("ppal-plugin-host", slot)).toStrictEqual(
        expect.objectContaining({ dialSet: false, unchanged: true }),
      );

      const dial = await findDial(deviceId, "Automation 001");
      const clipId = await newClip(track);

      await automate(clipId, `${dial}: 1|1 0.2`);

      // A tempo change is the marker: if playback added undo steps, one undo
      // would take one of them back instead of the tempo.
      const [tempo] = (await liveApi("live_set", [
        { type: "get-property", property: "tempo" },
      ])) as [number];

      try {
        await liveApi("live_set", [
          { type: "set-property", property: "tempo", value: tempo + 7 },
        ]);
        await sleep(UNDO_SETTLE_MS);
        await call("ppal-playback", {
          action: "play-session-clips",
          id: clipId,
        });

        expect(await waitForMainVolume(deviceId, 0.2)).toBeCloseTo(0.2, 1);

        await call("ppal-playback", { action: "stop-all-session-clips" });
        await sleep(UNDO_SETTLE_MS);
        await liveApi("live_set", [{ type: "call", method: "undo" }]);

        const [undone] = await liveApi("live_set", [
          { type: "get-property", property: "tempo" },
        ]);

        expect(undone).toBe(tempo);
      } finally {
        await liveApi("live_set", [
          { type: "set-property", property: "tempo", value: tempo },
        ]);
      }
    }, 60_000);

    it("keeps the slots on a duplicated track", async () => {
      const { track, path } = await hostOnNewTrack("Serum 2");
      const deviceId = (await readDevice(path)).id;

      await call("ppal-plugin-host", {
        deviceId,
        action: "map",
        slot: 3,
        name: "Main Vol",
      });

      const copy = await duplicateTrack(track);
      const copyDevice = await readDevice(`${copy}/${path.split("/").at(-1)}`);

      expect(
        await call("ppal-plugin-host", {
          deviceId: copyDevice.id,
          action: "slots",
        }),
      ).toStrictEqual(
        expect.objectContaining({
          slots: [{ slot: 3, index: expect.any(Number), name: "Main Vol" }],
        }),
      );
    });

    /**
     * Read a session clip's envelopes.
     * @param clipId - The clip's id
     * @returns One entry per automated parameter
     */
    async function readEnvelopes(clipId: string): Promise<EnvelopeEntry[]> {
      const clip = await call<{ envelopes?: EnvelopeEntry[] }>(
        "ppal-read-clip",
        { id: clipId, include: ["envelopes"] },
      );

      return clip.envelopes ?? [];
    }

    /**
     * Make a four-bar session clip on a track's first slot.
     * @param track - Track index
     * @returns The clip's id
     */
    async function newClip(track: number): Promise<string> {
      const clip = await call<{ id: string }>("ppal-create-clip", {
        path: `t${track}/s0`,
        notes: "C3 1|1",
        length: "4bar",
      });

      return clip.id;
    }

    /**
     * Write a clip's envelopes.
     * @param clipId - The clip's id
     * @param envelopes - The `envelopes` lines
     * @returns The clip's entry
     */
    function automate(clipId: string, envelopes: string) {
      return call("ppal-update-clip", { id: clipId, envelopes });
    }

    it("automates a hosted param by its device path and h id, and reads it back by name", async () => {
      const { track, path } = await hostOnNewTrack("Serum 2");
      const deviceId = (await readDevice(path)).id;
      const clipId = await newClip(track);

      expect(await automate(clipId, `${path}/h1: 1|1 0.2`)).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail: `envelope "${path}/h1": mapped to slot "Automation 001"`,
        }),
      );

      const [entry] = await readEnvelopes(clipId);

      expect(entry).toStrictEqual(
        expect.objectContaining({
          parameter: "Main Vol",
          id: `${path}/h1`,
          slot: "Automation 001",
        }),
      );

      // The id reads back as a target for the same envelope, with no new slot.
      expect(
        await automate(clipId, `${entry?.id}: 1|1 0.2`),
      ).not.toHaveProperty("detail");

      const [mainVol] = (await readDevice(path, "Main Vol")).parameters ?? [];

      expect(mainVol).toStrictEqual(
        expect.objectContaining({ id: "h1", slot: "Automation 001" }),
      );

      await call("ppal-playback", {
        action: "play-session-clips",
        id: clipId,
      });

      expect(await waitForMainVolume(deviceId, 0.2)).toBeCloseTo(0.2, 1);

      await call("ppal-playback", { action: "stop-all-session-clips" });
    }, 60_000);

    it("gives a second param the next slot, and clears by the same target", async () => {
      const { track, path } = await hostOnNewTrack("Serum 2");
      const clipId = await newClip(track);
      const listed = await call<HostedDevice>("ppal-read-device", {
        path,
        include: ["params"],
      });
      const other = listed.parameters?.find((param) => param.id !== "h1");

      await automate(clipId, `${path}/h1: 1|1 0.2`);

      expect(
        await automate(clipId, `${path}/${other?.id}: 1|1 0.5`),
      ).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail: `envelope "${path}/${other?.id}": mapped to slot "Automation 002"`,
        }),
      );
      expect(
        (await readEnvelopes(clipId))
          .map((entry) => entry.slot ?? "")
          .toSorted((a, b) => a.localeCompare(b)),
      ).toStrictEqual(["Automation 001", "Automation 002"]);

      await automate(clipId, `${path}/h1:`);

      expect(
        (await readEnvelopes(clipId)).map((entry) => entry.parameter),
      ).toStrictEqual([other?.name]);
    }, 60_000);

    it("clears nothing, without an error, for a param no slot drives", async () => {
      const { track, path } = await hostOnNewTrack("Serum 2");
      const clipId = await newClip(track);

      expect(await automate(clipId, `${path}/h1:`)).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail: `envelope "${path}/h1": there was no envelope to clear`,
        }),
      );
    });
  });
});
