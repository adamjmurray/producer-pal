// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for what a hosted plug-in's wrapper saves with the Set. Uses
 * Serum 2 and FabFilter Pro-Q 4, and skips each test on a machine without its
 * plug-in.
 *
 * Needs the wrappers installed (`npm run install:plugin-host`), the remote
 * script, and a debug build (`npm run build:debug`) for ppal-live-api and
 * ppal-plugin-host.
 *
 * Uses: e2e-test-set (adds its own MIDI tracks)
 *
 * Run with: npm run e2e:mcp:remote-script -- device/create/ppal-create-device-hosted-state
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setConfig, setupMcpTestContext, sleep } from "../../mcp-test-helpers";
import {
  type HostedDevice,
  hasVst3,
  hostedPluginHelpers,
} from "../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

// Live closes an undo step after about this long without a change.
const UNDO_SETTLE_MS = 5000;

describe.skipIf(!REMOTE_SCRIPT_E2E)("hosted plug-in state", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();

  const { call, hostOnNewTrack, readDevice, duplicateTrack } =
    hostedPluginHelpers(ctx);

  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  /**
   * Read or set the Set's tempo through ppal-live-api.
   * @param value - A tempo to set, or nothing to read it
   * @returns The tempo
   */
  async function tempo(value?: number): Promise<number> {
    const operation =
      value == null
        ? { type: "get-property", property: "tempo" }
        : { type: "set-property", property: "tempo", value };
    const { results } = await call<{ results: number[] }>("ppal-live-api", {
      path: "live_set",
      operations: [operation, { type: "get-property", property: "tempo" }],
    });

    return Number(results.at(-1));
  }

  /**
   * Wait for Live to close the undo step, undo once, and check that it took
   * back the tempo marker: anything else means the test added an undo step.
   * @param before - The tempo before the marker
   */
  async function expectUndoRestoresTempo(before: number): Promise<void> {
    await sleep(UNDO_SETTLE_MS);
    await call("ppal-live-api", {
      path: "live_set",
      operations: [{ type: "call", method: "undo" }],
    });

    expect(await tempo()).toBe(before);
  }

  it.skipIf(!hasVst3("Serum2.vst3"))(
    "adds no undo step when reading a hosted plug-in",
    async () => {
      const { track, path } = await hostOnNewTrack("Serum 2");
      const deviceId = (await readDevice(path)).id;
      const before = await tempo();

      // Let the load's own saves land before the marker.
      await sleep(UNDO_SETTLE_MS);

      try {
        // A tempo change is the marker: if a read added an undo step, one undo
        // would take that back instead of the tempo.
        await tempo(before + 7);
        await sleep(UNDO_SETTLE_MS);

        await readDevice(path, "Main Vol");
        await call("ppal-read-track", {
          path: `t${track}`,
          include: ["devices"],
        });

        for (const action of ["info", "params", "slots"]) {
          await call("ppal-plugin-host", { deviceId, action });
        }

        await expectUndoRestoresTempo(before);
      } finally {
        await tempo(before);
      }
    },
    60_000,
  );

  // Slots reach vst~ without the wrapper's script, which learns of their writes
  // from vst~'s echo. If it took them for window edits, it would save the state
  // and add undo steps while automation plays.
  it.skipIf(!hasVst3("Serum2.vst3"))(
    "moves a hosted param from clip automation without adding an undo step",
    async () => {
      const { track, path } = await hostOnNewTrack("Serum 2");
      const deviceId = (await readDevice(path)).id;
      const clip = `t${track}/s0`;
      const { params } = await call<{ params: { index: number }[] }>(
        "ppal-plugin-host",
        { deviceId, action: "params", names: ["Filter 1 Freq"] },
      );

      const readFreq = async () => {
        const read = await call<{ params: { value: number }[] }>(
          "ppal-plugin-host",
          { deviceId, action: "params", names: ["Filter 1 Freq"] },
        );

        return read.params[0]?.value;
      };

      await call("ppal-create-clip", {
        path: clip,
        notes: "C3 1|1",
        length: "4bar",
      });
      await call("ppal-update-clip", {
        path: clip,
        envelopes: `${path}/h${params[0]?.index}: 1|1 0 / 3|1 1 / 5|1 0`,
      });

      const before = await tempo();

      await sleep(UNDO_SETTLE_MS);

      try {
        await tempo(before + 7);
        await sleep(UNDO_SETTLE_MS);
        await call("ppal-playback", {
          action: "play-session-clips",
          path: clip,
        });
        await sleep(1000);

        const first = await readFreq();

        await sleep(1000);
        expect(await readFreq()).not.toBe(first);

        await sleep(3000);
        await call("ppal-playback", { action: "stop" });
        // The wait inside also outlasts the wrapper's 2 s poll, which would save
        // a state it took for an edit.
        await expectUndoRestoresTempo(before);
      } finally {
        await call("ppal-playback", { action: "stop" });
        await tempo(before);
      }
    },
    90_000,
  );

  // Right after a load, vst~ can report the file without its numeric id, so
  // "Pro-Q 4" reads like file "Pro-Q" with id 4. Live lists it by that name,
  // not by its bundle's file name.
  it.skipIf(!hasVst3("FabFilter Pro-Q 4.vst3"))(
    "keeps the name and slots of a plug-in whose file ends in a number",
    async () => {
      const { track, path } = await hostOnNewTrack("Pro-Q 4", {
        name: "My EQ",
      });
      const deviceId = (await readDevice(path)).id;

      await call("ppal-plugin-host", {
        deviceId,
        action: "map",
        slot: 2,
        index: 1,
      });

      const copy = await duplicateTrack(track);
      const copyDevice = await readDevice(`${copy}/${path.split("/").at(-1)}`);

      expect(copyDevice).toStrictEqual<HostedDevice>({
        id: expect.any(String),
        path: expect.any(String),
        type: "audio-effect: Pro-Q 4",
        hosted: true,
        name: "My EQ",
      });
      expect(
        await call("ppal-plugin-host", {
          deviceId: copyDevice.id,
          action: "slots",
        }),
      ).toStrictEqual(
        expect.objectContaining({
          slots: [
            { slot: 2, index: expect.any(Number), name: expect.any(String) },
          ],
        }),
      );
    },
  );
});
