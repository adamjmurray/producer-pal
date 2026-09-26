// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

// A toPath naming a lane or slot fully determines one place, so it can't cover
// more than one clip. Refused before any Live read - `id` alone never
// resolves against Live, so these throw with no mocks at all.
describe("updateClip - refuses one toPath place for several clips", () => {
  it.each([
    ["an arrangement spot", "t0[5|1]"],
    ["a take lane", "t0/l0[5|1]"],
    ["a session slot", "t0/s1"],
  ])("refuses %s shared by 2 ids", async (_label, toPath) => {
    await expect(updateClip({ id: "1,2", toPath })).rejects.toThrow(
      "toPath names 1 destination but the call names 2 clips. A destination " +
        "holds one object, so toPath must name one per clip, in order. A " +
        "bare [5|1] keeps each clip on its own track.",
    );
  });

  it("refuses a lane with no position, shared by 3 ids", async () => {
    await expect(updateClip({ id: "1,2,3", toPath: "t0" })).rejects.toThrow(
      "toPath names 1 destination but the call names 3 clips.",
    );
  });

  // The deprecated spelling only ever names a slot, so it never broadcasts.
  it("refuses one toSlot shared by 2 ids", async () => {
    await expect(updateClip({ id: "1,2", toSlot: "0/1" })).rejects.toThrow(
      "toSlot names 1 destination but the call names 2 clips. A destination " +
        "holds one object, so toSlot must name one per clip, in order.",
    );
  });

  // Neither id resolves to a real clip, so a call that gets past the refusal
  // answers with a skip per id - these ids only exist to prove the refusal did
  // NOT fire.

  /** The entry an id that resolves to this file's device stub leaves behind. */
  const notAClip = (id: string) => ({
    id,
    ok: false,
    detail: `id ${id} is not a clip (found device)`,
  });

  // A bare coordinate names no lane, so each clip keeps its own - it broadcasts
  // instead of refusing.
  it("does not refuse a bare position shared by several ids", async () => {
    await expect(
      updateClip({ id: "1,2", toPath: "[5|1]" }),
    ).resolves.toStrictEqual([notAClip("1"), notAClip("2")]);
  });

  // One id: nothing to share, so the lane destination is fine. One target that
  // got nothing done throws instead of answering with a list.
  it("does not refuse a lane destination for a single id", async () => {
    await expect(updateClip({ id: "1", toPath: "t0[5|1]" })).rejects.toThrow(
      "id 1 is not a clip (found device)",
    );
  });

  // N destinations for N ids already pair 1:1; nothing here is shared.
  it("does not refuse one destination per id", async () => {
    await expect(
      updateClip({ id: "1,2", toPath: "t0[5|1],t1[9|1]" }),
    ).resolves.toStrictEqual([notAClip("1"), notAClip("2")]);
  });
});
