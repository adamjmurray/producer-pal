// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Stamping the lane changes nothing about what a clip copy reports: what it
// overwrote reads the same with or without the clip's automation.

import { describe, expect, it } from "vitest";
import "../../../tests/duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerStampWorld } from "./stamp-world-test-helpers.ts";

/**
 * Copy the world's source to bar 5 at two bars.
 * @param hasEnvelopes - Whether the source clip has automation
 * @returns The duplicate() result, and the world
 */
async function copyOverAClip(hasEnvelopes: boolean) {
  const world = registerStampWorld({
    source: { has_envelopes: hasEnvelopes ? 1 : 0 },
    existing: [{ start: 16, end: 20 }],
  });
  const result = await duplicate({
    type: "clip",
    id: world.source.id,
    arrangementStart: "5|1",
    arrangementLength: "2bar",
  });

  return { result, world };
}

describe("duplicate - a session clip with automation, at another length", () => {
  it("reports the same as the copy of a clip without automation", async () => {
    const plain = await copyOverAClip(false);
    const automated = await copyOverAClip(true);

    expect(plain.world.copies()).toHaveLength(1);
    expect(automated.world.stamps().length).toBeGreaterThan(1);
    // The stamps use up clip ids, so the copy's own id differs.
    const entry = {
      id: expect.any(String) as string,
      path: "t0[5|1]",
      detail: "overwrote the clip at t0[5|1]",
    };

    expect(plain.result).toStrictEqual(entry);
    expect(automated.result).toStrictEqual(entry);
  });

  it("says what the lane got, and what was cleared, when the clip itself isn't placed", async () => {
    const world = registerStampWorld({ existing: [{ start: 16, end: 20 }] });

    // Two stamps, then Live declines the clip's own copy.
    world.declinesCopy = (count) => count === 2;

    const result = await duplicate({
      type: "clip",
      id: world.source.id,
      arrangementStart: "5|1",
      arrangementLength: "2bar",
    });

    expect(result).toStrictEqual({
      path: "t0[5|1]",
      detail:
        "Live made no copy there; already changed: automation written for all 8 beats; overwrote the clip at t0[5|1]",
    });
  });
});
