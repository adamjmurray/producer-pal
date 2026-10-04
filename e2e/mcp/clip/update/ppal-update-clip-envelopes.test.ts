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
import { describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  type ClipEnvelopeResult,
  parseToolResult,
  type ReadClipResult,
  setConfig,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const TRACK = `t${String(EMPTY_MIDI_TRACK)}`;

/** A jump and a ramp, in raw pan values (-1..1). */
const NOTATION = "1|1 -0.5 > 2|1 0.5 ~ 3|1 0";

const REENABLED_DETAIL =
  'envelope "pan": re-enabled its automation, which was overridden';

/** Live's `automation_state` once the user has moved an automated parameter. */
const OVERRIDDEN = 2;

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "ppal-update-clip — clip automation envelopes",
  () => {
    requireRemoteScript();

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

    it("reports a refused line and still writes the others", async () => {
      const id = await emptyClip();

      // Volume tops out at 1, so the first line is refused by the route.
      const result = await writeEnvelopes(
        id,
        `volume: 1|1 5\npan: ${NOTATION}`,
      );

      expect(result).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail: expect.stringMatching(
            /^envelope "volume": .*outside/,
          ) as string,
        }),
      );

      const envelopes = (await readEnvelopes(id)) as ClipEnvelopeResult[];

      expect(envelopes).toHaveLength(1);
      expect(envelopes[0]?.events).toMatch(/^1\|1 -0\.5/);
    });

    it("clears an envelope when the line has nothing after the colon", async () => {
      const id = await emptyClip();

      await writeEnvelopes(id, `pan: ${NOTATION}`);

      expect(await writeEnvelopes(id, "pan:")).toStrictEqual(
        expect.objectContaining({ envelopes: 1 }),
      );
      expect(await readEnvelopes(id)).toStrictEqual([]);
    });

    /**
     * Run raw Live API operations on an object.
     * @param id - The object's Live API id
     * @param operations - The operations to run
     * @returns One result per operation
     */
    async function liveApi(
      id: string,
      operations: unknown[],
    ): Promise<unknown[]> {
      return parseToolResult<{ results: unknown[] }>(
        await ctx.client!.callTool({
          name: "ppal-live-api",
          arguments: { path: `id ${id}`, operations },
        }),
      ).results;
    }

    /**
     * Wait for a parameter's `automation_state`, which Live updates a moment
     * after playback starts, stops or the parameter moves.
     * @param parameterId - The parameter's Live API id
     * @param wanted - The state to wait for
     */
    async function waitForAutomationState(
      parameterId: string,
      wanted: number,
    ): Promise<void> {
      let state: unknown;

      for (let attempt = 0; attempt < 20; attempt++) {
        [state] = await liveApi(parameterId, [
          { type: "get-property", property: "automation_state" },
        ]);

        if (state === wanted) {
          return;
        }

        await sleep(100);
      }

      expect(state).toBe(wanted);
    }

    it("writes no re-enable detail when nothing was overridden", async () => {
      const id = await emptyClip();

      await writeEnvelopes(id, `pan: ${NOTATION}`);

      const result = await writeEnvelopes(id, "pan: 1|1 0.25");

      expect(result.envelopes).toBe(1);
      expect(result.detail).toBeUndefined();
    });

    it("re-enables an overridden parameter and says so", async () => {
      await setConfig({ liveApiEnabled: true });

      const id = await emptyClip();

      await writeEnvelopes(id, `pan: ${NOTATION}`);

      const parameterId = ((await readEnvelopes(id)) as ClipEnvelopeResult[])[0]
        ?.id as string;

      expect(parameterId).toBeDefined();

      try {
        await ctx.client!.callTool({
          name: "ppal-playback",
          arguments: { action: "play-session-clips", id },
        });
        // Launch quantization can delay the start, so wait for the envelope.
        await waitForAutomationState(parameterId, 1);

        // Moving the parameter while the clip plays overrides its automation.
        await liveApi(parameterId, [
          { type: "set", property: "value", value: 0.3 },
        ]);
        await waitForAutomationState(parameterId, OVERRIDDEN);

        expect(await writeEnvelopes(id, "pan: 1|1 0.25")).toStrictEqual(
          expect.objectContaining({
            envelopes: 1,
            detail: REENABLED_DETAIL,
          }),
        );

        // Re-enabling takes effect a moment after the write returns.
        await waitForAutomationState(parameterId, 1);
      } finally {
        await ctx.client!.callTool({
          name: "ppal-playback",
          arguments: { action: "stop-all-session-clips" },
        });
      }

      // Once the clip stops the override is gone, so a write says nothing.
      await waitForAutomationState(parameterId, 0);

      const plain = await writeEnvelopes(id, "pan: 1|1 -0.25");

      expect(plain.envelopes).toBe(1);
      expect(plain.detail).toBeUndefined();
    });
  },
);
