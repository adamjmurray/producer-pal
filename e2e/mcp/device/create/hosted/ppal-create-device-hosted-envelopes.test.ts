// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for clip envelopes on a hosted plug-in's param named by the
 * plug-in's own name, with values written as the plug-in shows them. Uses
 * Serum 2 ("Env 1 Decay" shows seconds), so it skips on a machine without it.
 *
 * Needs the wrappers installed (`npm run install:plugin-host`) and the remote
 * script.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/device/create/hosted/ppal-create-device-hosted-envelopes.test.ts
 */
import { describe, expect, it } from "vitest";
import { setupMcpTestContext, sleep } from "../../../mcp-test-helpers";
import {
  hasVst3,
  hostedPluginHelpers,
} from "../../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../helpers/remote-script-test-helpers";

const DECAY = "Env 1 Decay";

describe.skipIf(!REMOTE_SCRIPT_E2E || !hasVst3("Serum2.vst3"))(
  "hosted plug-in envelopes by name and display value",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();
    const { call, hostOnNewTrack, readDevice } = hostedPluginHelpers(ctx);

    /**
     * Host Serum 2 on a new track with a four-bar clip.
     * @returns The device's path and the clip's id
     */
    async function hostWithClip(): Promise<{ path: string; clipId: string }> {
      const { track, path } = await hostOnNewTrack("Serum 2");
      const clip = await call<{ id: string }>("ppal-create-clip", {
        path: `t${track}/s0`,
        notes: "C3 1|1",
        length: "4bar",
      });

      return { path, clipId: clip.id };
    }

    /**
     * Read what the plug-in shows for the decay.
     * @param path - The hosted device
     * @returns The display, like "2.00 s"
     */
    async function shownDecay(path: string): Promise<string> {
      const [param] = (await readDevice(path, DECAY)).parameters ?? [];

      return String(param?.value);
    }

    it("writes a named param in the plug-in's units, and plays it", async () => {
      const { path, clipId } = await hostWithClip();
      const before = await shownDecay(path);
      const target = `${path}/${DECAY.toLowerCase()}`;

      expect(
        await call("ppal-update-clip", {
          id: clipId,
          envelopes: `${target}: 1|1 (2 s)`,
        }),
      ).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail: `envelope "${target}": mapped to slot "Slot 001"`,
        }),
      );

      // The search put the param back; only playback moves it.
      expect(await shownDecay(path)).toBe(before);

      const clip = await call<{
        envelopes?: { parameter: string; id: string; slot?: string }[];
      }>("ppal-read-clip", { id: clipId, include: ["envelopes"] });

      expect(clip.envelopes).toStrictEqual([
        expect.objectContaining({ parameter: DECAY, slot: "Slot 001" }),
      ]);

      await call("ppal-playback", { action: "play-session-clips", id: clipId });

      let shown = "";

      for (let attempt = 0; attempt < 30; attempt++) {
        shown = await shownDecay(path);

        if (/^2\.0\d* s$/.test(shown)) {
          break;
        }

        await sleep(200);
      }

      await call("ppal-playback", { action: "stop-all-session-clips" });

      expect(shown).toMatch(/^2\.0\d* s$/);
    }, 60_000);

    it("writes the nearest end for a value past the range", async () => {
      const { path, clipId } = await hostWithClip();
      const target = `${path}/${DECAY}`;
      const result = await call<{ envelopes: number; detail?: string }>(
        "ppal-update-clip",
        { id: clipId, envelopes: `${target}: 1|1 (9999 s)` },
      );

      expect(result.envelopes).toBe(1);
      expect(result.detail).toMatch(
        /^envelope ".*": .*past the range, wrote \(9999 s\) as \S+ s$/,
      );
    }, 60_000);
  },
);
