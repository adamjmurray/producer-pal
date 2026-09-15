// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The contract every write tool's fan-out keeps: one entry per target named, in
// order, and a failure that costs its own slot rather than the call.

import { describe, expect, it } from "vitest";
import { type NamedTarget } from "../../lists/named-targets.ts";
import { writeFanOut } from "../../lists/write-fan-out.ts";

const T0: NamedTarget = { param: "path", value: "t0" };
const ID_9: NamedTarget = { param: "id", value: "9" };

describe("writeFanOut", () => {
  it("returns the result on its own when one target was named", () => {
    expect(writeFanOut([T0], ({ value }) => ({ wrote: value }))).toStrictEqual({
      wrote: "t0",
    });
  });

  // Nothing was written and there is no list for an entry to hold a place in,
  // so the caller gets the reason as an error.
  it("rethrows when the one target it was given failed", () => {
    expect(() =>
      writeFanOut([T0], () => {
        throw new Error('no track at path "t0"');
      }),
    ).toThrow('no track at path "t0"');
  });

  it("keeps a failed target's slot, addressed by the param that named it", () => {
    const result = writeFanOut([ID_9, T0], ({ value }) => {
      if (value === "9") {
        throw new Error('id "9" does not exist');
      }

      return { wrote: value };
    });

    expect(result).toStrictEqual([
      { id: "9", ok: false, reason: 'id "9" does not exist' },
      { wrote: "t0" },
    ]);
  });

  it("passes each target its own position, for paired name and color lists", () => {
    expect(writeFanOut([T0, ID_9], (_target, index) => index)).toStrictEqual([
      0, 1,
    ]);
  });

  it("writes nothing when no target was named", () => {
    expect(writeFanOut([], () => ({ wrote: "anything" }))).toStrictEqual([]);
  });
});
