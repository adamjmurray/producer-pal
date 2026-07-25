// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E round-trip for MIDI JSON ratio durations through the real Max V8 runtime +
 * Live: create a clip whose notes carry 1/3-beat triplet durations written as
 * ratios (`d:1/3`), let Live store them, read them back under MIDI JSON notation,
 * and re-interpret.
 *
 * Ratios are the fix for MIDI JSON's float-only fields: a triplet duration used
 * to serialize as a lossy `d:0.3333`; now it round-trips as the exact `d:1/3`.
 * This is the real-device fidelity check unit tests can't cover — does Live store
 * thirds-of-a-beat with enough precision that the serializer snaps them back to a
 * ratio? The `not.toContain(".")` guard is the sharp assertion: every value in a
 * pure-triplet clip is an integer or a ratio, so ANY drift to a decimal would
 * surface a `.` in the read-back string.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track. Slots /0 and /1 are both 4/4,
 * where musical beats == Ableton beats. See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-midi-json-ratio-roundtrip
 */
import { describe, expect, it } from "vitest";
import { interpretMidiJson } from "#src/notation/midi-json/midi-json-notation.ts";
import { setupMcpTestContext } from "../mcp-test-helpers.ts";
import {
  createAndReadback,
  emptyMidiTrack,
  expectEvenlySpaced,
  restoreNotationAfterAll,
  THIRD,
} from "./helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

restoreNotationAfterAll();

describe("ppal-create-clip MIDI JSON ratio round-trip", () => {
  it("round-trips eighth-note triplets (d:1/3) as thirds-of-a-beat", async () => {
    const { notation, events } = await createAndReadback(
      ctx,
      `${emptyMidiTrack}/0`,
      "[{p:60,t:0,d:1/3,v:100},{p:64,t:1/3,d:1/3,v:100}," +
        "{p:67,t:2/3,d:1/3,v:100},{p:60,t:1,d:1/3,v:100}," +
        "{p:64,t:4/3,d:1/3,v:100},{p:67,t:5/3,d:1/3,v:100}]",
      "midi-json",
      interpretMidiJson,
    );

    expect(notation).toContain("d:1/3"); // the ratio survived as a ratio
    expect(notation).toContain("t:2/3");
    expect(notation).not.toContain("."); // no drift → no decimal anywhere
    expectEvenlySpaced(events, [60, 64, 67, 60, 64, 67], THIRD);
  });

  it("round-trips quarter-note triplets (d:2/3) as two-thirds-of-a-beat", async () => {
    const { notation, events } = await createAndReadback(
      ctx,
      `${emptyMidiTrack}/1`,
      "[{p:60,t:0,d:2/3,v:100},{p:64,t:2/3,d:2/3,v:100}," +
        "{p:67,t:4/3,d:2/3,v:100}]",
      "midi-json",
      interpretMidiJson,
    );

    expect(notation).toContain("d:2/3");
    expect(notation).toContain("t:4/3");
    expect(notation).not.toContain(".");
    expectEvenlySpaced(events, [60, 64, 67], 2 * THIRD);
  });
});
