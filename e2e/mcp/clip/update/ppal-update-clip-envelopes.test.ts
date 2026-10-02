// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-clip's `envelopes` param, which only the Producer
 * Pal remote script can write. Opt-in: skipped unless E2E_REMOTE_SCRIPT=true,
 * and failed, not skipped, when that's set but the script isn't answering.
 *
 * Every assertion goes through ppal-read-clip, so the round trip is checked in
 * the notation a caller actually writes.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- clip/update/ppal-update-clip-envelopes
 */
import { beforeAll, describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  type ClipEnvelopeResult,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import { remoteScriptAnswers } from "../../workflow/helpers/server-capability-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const TRACK = `t${String(EMPTY_MIDI_TRACK)}`;

/** A jump and a ramp, in raw pan values (-1..1). */
const NOTATION = "1|1 -0.5 > 2|1 0.5 ~ 3|1 0";

describe.skipIf(process.env.E2E_REMOTE_SCRIPT !== "true")(
  "ppal-update-clip — clip automation envelopes",
  () => {
    // Ahead of the per-test hooks, so a missing remote script fails before any
    // Live Set opens.
    beforeAll(async () => {
      if (!(await remoteScriptAnswers())) {
        throw new Error(
          `E2E_REMOTE_SCRIPT=true, but the Producer Pal remote script isn't running: nothing answered GET /ping on 127.0.0.1:${process.env.PPAL_REMOTE_SCRIPT_PORT ?? "3349"}. Install it and select it as a control surface (see remote-script/README.md).`,
        );
      }
    });

    const ctx = setupMcpTestContext();

    /**
     * Write one clip's automation.
     * @param id - The clip to write
     * @param envelopes - The `envelopes` param
     * @returns The clip's result entry
     */
    async function writeEnvelopes(
      id: string,
      envelopes: string,
    ): Promise<UpdateClipResult> {
      const result = parseToolResult<UpdateClipResult>(
        await ctx.client!.callTool({
          name: "ppal-update-clip",
          arguments: { id, envelopes },
        }),
      );

      await sleep(100);

      return result;
    }

    /**
     * Read one clip's automation back.
     * @param id - The clip to read
     * @returns Whatever its `envelopes` came back as
     */
    async function readEnvelopes(
      id: string,
    ): Promise<ClipEnvelopeResult[] | string | undefined> {
      return parseToolResult<ReadClipResult>(
        await ctx.client!.callTool({
          name: "ppal-read-clip",
          arguments: { id, include: ["envelopes"] },
        }),
      ).envelopes;
    }

    /**
     * A 4-bar clip on the empty MIDI track, in its first slot.
     * @returns The clip's id
     */
    async function emptyClip(): Promise<string> {
      return createClipInSlot(ctx, `${TRACK}/s0`, {
        notes: "C3 1|1",
        length: "4bar",
      });
    }

    it("round-trips a mixer envelope through the notation", async () => {
      const id = await emptyClip();

      expect(await writeEnvelopes(id, `pan: ${NOTATION}`)).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
        }),
      );

      const envelopes = await readEnvelopes(id);

      expect(envelopes).toHaveLength(1);
      expect((envelopes as ClipEnvelopeResult[])[0]).toStrictEqual(
        expect.objectContaining({
          // Live's own name for the parameter, which is not ours to predict.
          parameter: expect.any(String) as string,
          // Each point may carry Live's display string, which is not ours either.
          events: expect.stringMatching(
            /^1\|1 -0\.5.*> 2\|1 0\.5.*~ 3\|1 0/,
          ) as string,
        }),
      );
    });

    it("writes a parameter named by the id a read gave back", async () => {
      const id = await emptyClip();

      await writeEnvelopes(id, `pan: ${NOTATION}`);

      const written = (await readEnvelopes(id)) as ClipEnvelopeResult[];
      const parameterId = written[0]?.id;

      expect(parameterId).toBeDefined();
      expect(
        await writeEnvelopes(id, `${String(parameterId)}: 1|1 0.25`),
      ).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
      expect((await readEnvelopes(id)) as ClipEnvelopeResult[]).toStrictEqual([
        expect.objectContaining({
          events: expect.stringMatching(/^1\|1 0\.25/) as string,
        }),
      ]);
    });

    it("clears an envelope when the line has nothing after the colon", async () => {
      const id = await emptyClip();

      await writeEnvelopes(id, `pan: ${NOTATION}`);

      expect(await writeEnvelopes(id, "pan:")).toStrictEqual(
        expect.objectContaining({ envelopes: 1 }),
      );
      expect(await readEnvelopes(id)).toStrictEqual([]);
    });
  },
);
