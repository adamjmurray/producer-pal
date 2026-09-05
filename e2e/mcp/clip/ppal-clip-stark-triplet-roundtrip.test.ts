// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E round-trip for Stark triplet (`t`) durations through the real Max V8
 * runtime + Live: create a clip whose notes carry 1/3-beat triplet durations,
 * let Live store them, read them back under Stark notation, and re-interpret.
 *
 * Triplets are the first note-content durations that are NOT exact binary
 * fractions (1/3, 2/3 beat), so this is the real-device fidelity check that unit
 * tests can't cover: does Live faithfully store thirds-of-a-beat onsets and
 * durations with enough precision that the serializer snaps them back to `/8t`
 * and `/4t` — rather than drifting to `/16` plus a compensating `z` rest? The
 * `not.toContain("z")` guard is the sharp assertion: any drift past the snap
 * epsilon would surface as a rest.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track (pitched, no Drum Rack, so it
 * serializes back as a `melody:` line). Slots /0 and /1 are both 4/4.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-stark-triplet-roundtrip
 */
import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { setupMcpTestContext } from "../mcp-test-helpers.ts";
import {
  createAndReadback,
  expectEvenlySpaced,
  restoreNotationAfterAll,
  THIRD,
} from "./helpers/ppal-clip-transforms-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

restoreNotationAfterAll();

describe("ppal-create-clip Stark triplet round-trip", () => {
  it("round-trips eighth-note triplets (/8t) as thirds-of-a-beat", async () => {
    const { notation, events } = await createAndReadback(
      ctx,
      `t${EMPTY_MIDI_TRACK}/s0`,
      "melody /8t: C E G C E G",
      "stark",
      interpretNotation,
    );

    expect(notation).toContain("/8t"); // the triplet survived as a triplet
    expect(notation).not.toContain("z"); // no drift → no compensating rest
    expectEvenlySpaced(events, [60, 64, 67, 60, 64, 67], THIRD);
  });

  it("round-trips quarter-note triplets (/4t) as two-thirds-of-a-beat", async () => {
    const { notation, events } = await createAndReadback(
      ctx,
      `t${EMPTY_MIDI_TRACK}/s1`,
      "melody /4t: C E G",
      "stark",
      interpretNotation,
    );

    expect(notation).toContain("/4t");
    expect(notation).not.toContain("z");
    expectEvenlySpaced(events, [60, 64, 67], 2 * THIRD);
  });
});
