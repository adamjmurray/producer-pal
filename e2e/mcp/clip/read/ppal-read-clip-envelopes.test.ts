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
import { beforeAll, describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { remoteScriptAnswers } from "../../workflow/helpers/server-capability-test-helpers.ts";
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

describe.skipIf(process.env.E2E_REMOTE_SCRIPT !== "true")(
  "ppal-read-clip — clip automation envelopes",
  () => {
    // Ahead of the per-test hooks, so a missing remote script fails before any
    // Live Set opens.
    beforeAll(async () => {
      if (!(await remoteScriptAnswers())) {
        throw new Error(
          `E2E_REMOTE_SCRIPT=true, but the Producer Pal remote script isn't running: nothing answered GET /ping on 127.0.0.1:${port()}. Install it and select it as a control surface (see remote-script/README.md).`,
        );
      }
    });

    const ctx = setupMcpTestContext();

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

    it("reads back an envelope the remote script wrote", async () => {
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

      expect(await readEnvelopes(id)).toStrictEqual([
        {
          // Live's own name for the parameter, which is not ours to predict.
          parameter: expect.any(String),
          id: expect.any(String),
          eventCount: POINTS.length,
          // A ramp between the two points, each with Live's own display, which
          // is not ours to predict.
          events: expect.stringMatching(/^1\|1 0\.5 .*~ 1\|3 0\.9/),
        },
      ]);
    });

    it("leaves envelopes out of a '*' read", async () => {
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

      expect(await readEnvelopes(id, ["*"])).toBeUndefined();
    });

    it("sends an arrangement clip to the track's automation lane", async () => {
      const id = await createArrangementClip(ctx, "5|1", "C3 1|1", "1bar");

      expect(await readEnvelopes(id)).toContain("automation lane");
    });
  },
);

/**
 * The port the remote script listens on.
 * @returns The port, as the client and the tests both resolve it
 */
function port(): string {
  return process.env.PPAL_REMOTE_SCRIPT_PORT ?? "3349";
}

/**
 * Write one envelope over the remote script's own HTTP route.
 * @param body - The /envelope/write request body
 */
async function writeEnvelope(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port()}/envelope/write`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(200);
  await sleep(100);
}
