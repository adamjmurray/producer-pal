// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { runWrite } from "../write-pipeline.ts";
import { type Cover } from "../write-pipeline-types.ts";
import { newToyLog, ranOutOfTime, runToy, toySpec } from "./toy-write-spec.ts";

const slot = (path: string): Cover => ({ slot: path });
const lane = (from: number, to: number, as: string): Cover => ({
  lane: "t0",
  from,
  to,
  as,
});

const SAME_SLOT = { a: [slot("t2/s1")], b: [slot("t2/s1")] };
const CUT_SHORT = {
  a: [lane(0, 8, "t0[1|1]")],
  b: [lane(4, 12, "t0[2|1]")],
};
const CUT_SHORT_TWICE = {
  a: [lane(0, 8, "t0[1|1]")],
  b: [lane(4, 12, "t0[B]")],
  c: [lane(6, 14, "t0[C]")],
};
const REPLACED_BETWEEN_TWO = {
  a: [lane(0, 8, "t0[1|1]")],
  b: [lane(0, 4, "t0[B]")],
  c: [lane(4, 8, "t0[C]")],
};
const TWO_SLOTS_EACH_COVERED = {
  a: [slot("t2/s1"), slot("t3/s1")],
  b: [slot("t2/s1")],
  c: [slot("t3/s1")],
};

describe("a later target that goes over an earlier one", () => {
  it("leaves an earlier slot write unwritten, naming the later one", () => {
    const { result, log } = runToy({
      ids: "a,b",
      covers: SAME_SLOT,
    });

    expect(log.writes).toStrictEqual(["b"]);
    expect(result).toStrictEqual([
      { id: "a", detail: "overwritten later in this call by t2/s1" },
      { id: "b", wrote: true },
    ]);
  });

  it("leaves an earlier stretch unwritten when a later one covers all of it", () => {
    const { result, log } = runToy({
      ids: "a,b",
      covers: {
        a: [lane(4, 8, "t0[2|1]")],
        b: [lane(0, 16, "t0[1|1]")],
      },
    });

    expect(log.writes).toStrictEqual(["b"]);
    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      detail: "overwritten later in this call by t0[1|1]",
    });
  });

  it("says nothing of ok or deleted on the earlier entry", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: SAME_SLOT,
    });

    expect((result as object[])[0]).not.toHaveProperty("ok");
    expect((result as object[])[0]).not.toHaveProperty("deleted");
  });

  it("marks the earlier target superseded for settle", () => {
    const { log } = runToy({
      ids: "a,b",
      covers: SAME_SLOT,
    });

    expect(log.settled[0]?.outcomes).toStrictEqual(["superseded", "written"]);
  });

  it("writes an earlier stretch the later one only partly covers, saying it was cut short", () => {
    const { result, log } = runToy({
      ids: "a,b",
      covers: CUT_SHORT,
    });

    expect(log.writes).toStrictEqual(["a", "b"]);
    expect(result).toStrictEqual([
      {
        id: "a",
        wrote: true,
        detail: "shortened by t0[2|1] later in this call",
      },
      { id: "b", wrote: true },
    ]);
  });

  it("tells settle which targets it already said were cut short", () => {
    const { log } = runToy({
      ids: "a,b",
      covers: CUT_SHORT,
    });

    expect(log.settled[0]?.shortened).toStrictEqual([0]);
  });

  it("leaves stretches on different lanes alone", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: {
        a: [{ lane: "t0/l1", from: 0, to: 8, as: "t0/l1[1|1]" }],
        b: [lane(0, 8, "t0[1|1]")],
      },
    });

    expect(result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "b", wrote: true },
    ]);
  });

  it("leaves stretches that only share an edge alone", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: { a: [lane(0, 4, "t0[1|1]")], b: [lane(4, 8, "t0[2|1]")] },
    });

    expect(result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "b", wrote: true },
    ]);
  });

  it("never lets a slot cover a stretch, or the other way", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: { a: [slot("t0")], b: [lane(0, 8, "t0[1|1]")] },
    });

    expect(result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "b", wrote: true },
    ]);
  });

  it("needs every ground an earlier target writes over to be covered", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: {
        a: [slot("t2/s1"), slot("t3/s1")],
        b: [slot("t2/s1")],
      },
    });

    expect(result).toStrictEqual([
      { id: "a", wrote: true, detail: "shortened by t2/s1 later in this call" },
      { id: "b", wrote: true },
    ]);
  });

  it("names the last target to go over each ground whichever ground is listed first", () => {
    const { result } = runToy({
      ids: "a,b,c",
      covers: {
        a: [slot("t3/s1"), slot("t2/s1")],
        b: [slot("t2/s1")],
        c: [slot("t3/s1")],
      },
    });

    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      detail: "overwritten later in this call by t3/s1",
    });
  });

  it("names the last of the targets that cover all of an earlier one", () => {
    const { result } = runToy({
      ids: "a,b,c",
      covers: {
        a: [slot("t2/s1")],
        b: [slot("t2/s1")],
        c: [slot("t2/s1")],
      },
    });

    expect(result).toStrictEqual([
      { id: "a", detail: "overwritten later in this call by t2/s1" },
      { id: "b", detail: "overwritten later in this call by t2/s1" },
      { id: "c", wrote: true },
    ]);
  });

  it("names the last target to go over each ground when different ones do", () => {
    const { result } = runToy({
      ids: "a,b,c",
      covers: TWO_SLOTS_EACH_COVERED,
    });

    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      detail: "overwritten later in this call by t3/s1",
    });
  });

  it("names the last of several targets that each cut an earlier one short", () => {
    const { result } = runToy({
      ids: "a,b,c",
      covers: CUT_SHORT_TWICE,
    });

    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      wrote: true,
      detail: "shortened by t0[C] later in this call",
    });
  });

  it("replaces a stretch two later targets go over between them, naming the last", () => {
    const { result, log } = runToy({
      ids: "a,b,c",
      covers: REPLACED_BETWEEN_TWO,
    });

    expect(log.writes).toStrictEqual(["b", "c"]);
    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      detail: "overwritten later in this call by t0[C]",
    });
  });

  it("leaves a stretch alone when what later targets cover has a gap in it", () => {
    const { log } = runToy({
      ids: "a,b,c",
      covers: {
        a: [lane(0, 8, "t0[1|1]")],
        b: [lane(0, 3, "t0[B]")],
        c: [lane(4, 8, "t0[C]")],
      },
    });

    expect(log.writes).toStrictEqual(["a", "b", "c"]);
  });

  it("never lets a replaced target cut anything short", () => {
    // c replaces b, so only c is left to cut a short.
    const { result, log } = runToy({
      ids: "a,b,c",
      covers: {
        a: [lane(0, 8, "t0[1|1]")],
        b: [lane(4, 12, "t0[B]")],
        c: [lane(4, 12, "t0[C]")],
      },
    });

    expect(log.writes).toStrictEqual(["a", "c"]);
    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      wrote: true,
      detail: "shortened by t0[C] later in this call",
    });
  });

  it("doesn't count a skipped target as going over anything", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: SAME_SLOT,
      skip: { b: "no such b" },
    });

    expect(result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "b", ok: false, detail: "no such b" },
    ]);
  });

  it("tells the plan which targets nothing will write", () => {
    const { log } = runToy({
      ids: "a,b,c,d,e",
      keys: { a: "same", b: "same" },
      covers: { d: [slot("t2/s1")], e: [slot("t2/s1")] },
      skip: { c: "x" },
    });

    expect(log.unwritten[0]?.toSorted()).toStrictEqual([0, 2, 3]);
  });
});

describe("a replacement that fails", () => {
  it("leaves the earlier target ok:false, since nothing replaced it", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: SAME_SLOT,
      failBefore: ["b"],
    });

    expect(result).toStrictEqual([
      {
        id: "a",
        ok: false,
        detail: "not written: t2/s1 was meant to replace it, but failed",
      },
      { id: "b", ok: false, detail: "b refused" },
    ]);
  });

  it("settles the earlier target as skipped", () => {
    const { log } = runToy({
      ids: "a,b,c",
      covers: SAME_SLOT,
      failBefore: ["b"],
    });

    expect(log.settled[0]?.outcomes).toStrictEqual([
      "skipped",
      "skipped",
      "written",
    ]);
  });

  it("does the same for an object named again, naming it as the caller did", () => {
    const { result } = runToy({
      ids: "a,b",
      keys: { a: "same", b: "same" },
      failBefore: ["b"],
    });

    expect(result).toStrictEqual([
      {
        id: "a",
        ok: false,
        detail: "not written: id b was meant to replace it, but failed",
      },
      { id: "b", ok: false, detail: "b refused" },
    ]);
  });

  it("keeps the earlier target replaced when the later one only half landed", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: SAME_SLOT,
      failAfter: ["b"],
    });

    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      detail: "overwritten later in this call by t2/s1",
    });
  });

  // Saying the cover landed is saying something changed, so the target is
  // written and keeps what it replaced.
  it("counts a later write that only said its cover landed before it threw", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: SAME_SLOT,
      failAfterCoverOnly: ["b"],
    });

    expect(result).toStrictEqual([
      { id: "a", detail: "overwritten later in this call by t2/s1" },
      { id: "b", detail: "b then failed" },
    ]);
  });

  it("doesn't say an earlier target was cut short by a later one that failed", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: CUT_SHORT,
      failBefore: ["b"],
    });

    expect((result as object[])[0]).toStrictEqual({ id: "a", wrote: true });
  });

  it("doesn't cut short an earlier target that never landed", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: CUT_SHORT,
      failBefore: ["a"],
    });

    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      ok: false,
      detail: "a refused",
    });
  });

  it("doesn't cut short an earlier target whose own ground never landed", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: CUT_SHORT,
      coverMisses: ["a"],
    });

    expect((result as object[])[0]).toStrictEqual({ id: "a", wrote: true });
  });

  // The later write went through but wrote nothing over the ground, so it
  // replaced nothing.
  it("leaves the earlier target ok:false when the later one wrote none of its ground", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: SAME_SLOT,
      coverMisses: ["b"],
    });

    expect(result).toStrictEqual([
      {
        id: "a",
        ok: false,
        detail: "not written: t2/s1 was meant to replace it, but failed",
      },
      { id: "b", wrote: true },
    ]);
  });

  it("doesn't say a target was cut short by a later one that wrote none of its ground", () => {
    const { result } = runToy({
      ids: "a,b",
      covers: CUT_SHORT,
      coverMisses: ["b"],
    });

    expect((result as object[])[0]).toStrictEqual({ id: "a", wrote: true });
  });

  it("names the toucher that landed when a later one that touches it didn't", () => {
    const { result } = runToy({
      ids: "a,b,c",
      covers: CUT_SHORT_TWICE,
      coverMisses: ["c"],
    });

    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      wrote: true,
      detail: "shortened by t0[B] later in this call",
    });
  });

  it("looks at every target it took to replace a stretch", () => {
    const { result } = runToy({
      ids: "a,b,c",
      covers: REPLACED_BETWEEN_TWO,
      coverMisses: ["b"],
    });

    expect((result as object[])[0]).toStrictEqual({
      id: "a",
      ok: false,
      detail: "not written: t0[B] was meant to replace it, but failed",
    });
  });

  // Each target that was left unwritten for a later one is only unwritten
  // because that later one lands: when the chain breaks at the end, all of it
  // does.
  it("breaks a whole chain of targets left unwritten for one another", () => {
    const { result } = runToy({
      ids: "a,b,c",
      keys: { a: "same", b: "same" },
      covers: { b: [slot("t2/s1")], c: [slot("t2/s1")] },
      failBefore: ["c"],
    });

    expect(result).toStrictEqual([
      {
        id: "a",
        ok: false,
        detail: "not written: id b was meant to replace it, but failed",
      },
      {
        id: "b",
        ok: false,
        detail: "not written: t2/s1 was meant to replace it, but failed",
      },
      { id: "c", ok: false, detail: "c refused" },
    ]);
  });

  it("gives an earlier target the deadline's own detail when the later one was never reached", () => {
    const log = newToyLog();
    const result = runWrite(
      toySpec(log),
      { ids: "a,b", covers: SAME_SLOT },
      { deadline: Date.now() - 1 },
    );

    expect(result).toStrictEqual(ranOutOfTime("a", "b"));
  });

  it("tells the plan which targets a later one cuts short, and which", () => {
    const { log } = runToy({
      ids: "a,b",
      covers: CUT_SHORT,
    });

    expect(log.shortenedBy).toStrictEqual([[[0, [1]]]]);
  });
});
