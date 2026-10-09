// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { runWrite } from "../write-pipeline.ts";
import { newToyLog, runToy, toySpec, wroteAll } from "./toy-write-spec.ts";

describe("the order targets are written in", () => {
  it("is the order named when the tool has no plan", () => {
    const log = newToyLog();
    const result = runWrite(
      { ...toySpec(log), plan: undefined },
      { ids: "a,b,c" },
    );

    expect(log.writes).toStrictEqual(["a", "b", "c"]);
    expect(result as unknown[]).toHaveLength(3);
  });

  it("follows the plan, while the entries stay in the order named", () => {
    const { result, log } = runToy({ ids: "a,b,c", order: [2, 0, 1] });

    expect(log.writes).toStrictEqual(["c", "a", "b"]);
    expect(result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "b", wrote: true },
      { id: "c", wrote: true },
    ]);
  });

  it("writes a target the plan left out after the ones it named", () => {
    const { log } = runToy({ ids: "a,b,c", order: [2] });

    expect(log.writes).toStrictEqual(["c", "a", "b"]);
  });

  it("ignores a repeat, or an index that names no target", () => {
    const { log } = runToy({ ids: "a,b", order: [1, 1, 7, 0] });

    expect(log.writes).toStrictEqual(["b", "a"]);
  });

  it("keeps the order across an async write", async () => {
    const { result, log } = runToy({
      ids: "a,b,c",
      order: [1, 2, 0],
      slow: ["b"],
    });

    expect(await result).toStrictEqual(wroteAll("a", "b", "c"));
    expect(log.writes).toStrictEqual(["b", "c", "a"]);
    expect(log.overlap).toBe(1);
  });

  it("stops at the deadline in the planned order", () => {
    const { result } = runToy(
      { ids: "a,b", order: [1, 0] },
      { deadline: Date.now() - 1 },
    );

    expect(result).toStrictEqual([
      expect.objectContaining({ id: "a", ok: false }),
      expect.objectContaining({ id: "b", ok: false }),
    ]);
  });

  it("settles each target by its place in the call", () => {
    const { log } = runToy({
      ids: "a,b,c",
      order: [2, 1, 0],
      failBefore: ["a"],
    });

    expect(log.settled[0]?.outcomes).toStrictEqual([
      "skipped",
      "written",
      "written",
    ]);
  });
});

describe("a target that answers with several entries", () => {
  it("puts the extra entries right after the target's own", () => {
    const { result } = runToy({
      ids: "a,b,c",
      pieces: { b: ["b2", "b3"] },
    });

    expect(result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "b", wrote: true },
      { id: "b2", wrote: true },
      { id: "b3", wrote: true },
      { id: "c", wrote: true },
    ]);
  });

  it("keeps each target's entries together when writes run out of order", () => {
    const { result } = runToy({
      ids: "a,b",
      order: [1, 0],
      pieces: { a: ["a2"], b: ["b2"] },
    });

    expect(result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "a2", wrote: true },
      { id: "b", wrote: true },
      { id: "b2", wrote: true },
    ]);
  });

  it("answers a lone target that made several with a list", () => {
    expect(runToy({ ids: "a", pieces: { a: ["a2"] } }).result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "a2", wrote: true },
    ]);
  });

  it("still unwraps a lone target that made one", () => {
    expect(runToy({ ids: "a", pieces: { a: [] } }).result).toStrictEqual({
      id: "a",
      wrote: true,
    });
  });

  it("counts the target once, with the extra entries beside it", () => {
    const { log } = runToy({ ids: "a,b", pieces: { a: ["a2", "a3"] } });

    expect(log.settled[0]?.outcomes).toStrictEqual(["written", "written"]);
    expect(log.settled[0]?.entries).toHaveLength(2);
    expect(log.settled[0]?.pieces).toStrictEqual([
      [
        { id: "a2", wrote: true },
        { id: "a3", wrote: true },
      ],
      [],
    ]);
  });

  it("works for an async write", async () => {
    const { result } = runToy({
      ids: "a,b",
      slow: ["a"],
      pieces: { a: ["a2"] },
    });

    expect(await result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "a2", wrote: true },
      { id: "b", wrote: true },
    ]);
  });
});

describe("what the plan tells each write", () => {
  it("hands every write what the plan worked out for its target", () => {
    const { result } = runToy({ ids: "a,b", label: true, order: [1, 0] });

    expect(result).toStrictEqual([
      { id: "a", wrote: true, planned: "plan:a" },
      { id: "b", wrote: true, planned: "plan:b" },
    ]);
  });

  it("hands nothing when the plan worked out nothing", () => {
    expect(runToy({ ids: "a" }).result).toStrictEqual({
      id: "a",
      wrote: true,
    });
  });
});
