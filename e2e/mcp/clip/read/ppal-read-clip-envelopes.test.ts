// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-read-clip's `envelopes` include, which only the Producer
 * Pal remote script can answer. Opt-in: skipped unless E2E_REMOTE_SCRIPT=true,
 * and failed, not skipped, when that's set but the script isn't answering.
 *
 * The envelope under test is written over the remote script's own HTTP route,
 * so the read is checked against automation Producer Pal didn't produce.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- clip/read/ppal-read-clip-envelopes
 */
import { describe, expect, it } from "vitest";
import { resolveRemoteScriptPort } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";
import {
  createArrangementClip,
  createClipInSlot,
} from "../helpers/ppal-clip-transforms-test-helpers.ts";

const TRACK = `t${String(EMPTY_MIDI_TRACK)}`;

/** Two points a bar apart in the clip's 4/4, raw mixer-volume values. */
const POINTS = [
  { time: 0, value: 0.5 },
  { time: 2, value: 0.9 },
];

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "ppal-read-clip — clip automation envelopes",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();

    /**
     * Read one clip with the default include.
     * @param id - The clip to read
     * @returns The clip's read result
     */
    async function readClip(id: string): Promise<ReadClipResult> {
      await sleep(50);

      return parseToolResult<ReadClipResult>(
        await ctx.client!.callTool({
          name: "ppal-read-clip",
          arguments: { id },
        }),
      );
    }

    /**
     * Read one clip's envelopes.
     * @param id - The clip to read
     * @param include - The include array to send
     * @returns Whatever the clip's `envelopes` came back as
     */
    async function readEnvelopes(
      id: string,
      include: string[] = ["envelopes"],
    ): Promise<ReadClipResult["envelopes"]> {
      await sleep(50);

      return parseToolResult<ReadClipResult>(
        await ctx.client!.callTool({
          name: "ppal-read-clip",
          arguments: { id, include },
        }),
      ).envelopes;
    }

    /**
     * Make a session clip and give it a volume envelope over the remote
     * script's own route.
     * @returns The clip's id
     */
    async function clipWithVolumeEnvelope(): Promise<string> {
      const id = await createClipInSlot(ctx, `${TRACK}/s0`, {
        notes: "C3 1|1",
        length: "1bar",
      });

      await writeEnvelope({
        track: TRACK,
        slot: 0,
        parameter: "volume",
        points: POINTS,
      });

      return id;
    }

    it("reads back an envelope the remote script wrote", async () => {
      const id = await clipWithVolumeEnvelope();

      expect(await readEnvelopes(id)).toStrictEqual([
        {
          // Live's own name for the parameter, which is not ours to predict.
          parameter: expect.any(String),
          id: expect.any(String),
          eventCount: POINTS.length,
          // A ramp between the two points, each with Live's own display, which
          // is not ours to predict.
          events: expect.stringMatching(/^1\|1 0\.5 .*\/ 1\|3 0\.9/),
        },
      ]);
    });

    it("leaves envelopes out of a '*' read", async () => {
      const id = await clipWithVolumeEnvelope();

      expect(await readEnvelopes(id, ["*"])).toBeUndefined();
    });

    it("flags a session clip with envelopes in a default read", async () => {
      const id = await clipWithVolumeEnvelope();

      expect(await readClip(id)).toHaveProperty("envs", true);
    });

    it("leaves envs off a session clip without envelopes", async () => {
      const id = await createClipInSlot(ctx, `${TRACK}/s0`, {
        notes: "C3 1|1",
        length: "1bar",
      });

      expect(await readClip(id)).not.toHaveProperty("envs");
    });

    it("sends an arrangement clip to the track's automation lane", async () => {
      const id = await createArrangementClip(ctx, "5|1", "C3 1|1", "1bar");

      expect(await readEnvelopes(id)).toContain("automation lane");
    });
  },
);

/**
 * Write one envelope over the remote script's own HTTP route.
 * @param body - The /envelope/write request body
 */
async function writeEnvelope(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(
    `http://127.0.0.1:${String(await resolveRemoteScriptPort())}/envelope/write`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  expect(response.status).toBe(200);
  await sleep(100);
}
