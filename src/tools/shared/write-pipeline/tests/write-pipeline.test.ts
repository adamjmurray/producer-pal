// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { startPipelineProbe, stopPipelineProbe } from "../pipeline-probe.ts";
import { runWrite } from "../write-pipeline.ts";
import {
  newToyLog,
  ranOutOfTime,
  runToy,
  toySpec,
  wroteAll,
} from "./toy-write-spec.ts";

describe("runWrite", () => {
  it("answers one entry per target, in the order named", () => {
    const { result, log } = runToy({ ids: "c,a,b" });

    expect(result).toStrictEqual([
      { id: "c", wrote: true },
      { id: "a", wrote: true },
      { id: "b", wrote: true },
    ]);
    expect(log.writes).toStrictEqual(["c", "a", "b"]);
  });

  it("unwraps a lone entry", () => {
    expect(runToy({ ids: "a" }).result).toStrictEqual({
      id: "a",
      wrote: true,
    });
  });

  it("answers an empty call with an empty list", () => {
    // The toy names no targets only when handed none.
    expect(runToy({ ids: "" }).result).toStrictEqual([]);
  });

  it("stays sync while no write is async", () => {
    expect(runToy({ ids: "a,b" }).result).not.toBeInstanceOf(Promise);
  });

  it("goes async only when a write is, and finishes each target before the next", async () => {
    const { result, log } = runToy({ ids: "a,b,c", slow: ["a", "b"] });

    expect(result).toBeInstanceOf(Promise);
    expect(await result).toStrictEqual(wroteAll("a", "b", "c"));
    expect(log.writes).toStrictEqual(["a", "b", "c"]);
    expect(log.overlap).toBe(1);
  });

  it("refuses a call whose lists differ in length, writing nothing", () => {
    const log = newToyLog();

    expect(() =>
      runWrite(toySpec(log), { ids: "a,b", names: "x,y,z" }),
    ).toThrow("names 3 entries");
    expect(log.writes).toStrictEqual([]);
  });

  it("refuses a call its check refuses, writing nothing", () => {
    const log = newToyLog();

    expect(() => runWrite(toySpec(log), { ids: "a,b", refuse: true })).toThrow(
      "refused by the check",
    );
    expect(log.writes).toStrictEqual([]);
  });

  it("logs the run for the probe, even when the call is refused", () => {
    startPipelineProbe();
    expect(() => runToy({ ids: "a", refuse: true })).toThrow(
      "refused by the check",
    );
    runToy({ ids: "a" });

    expect(stopPipelineProbe()).toStrictEqual(["toy", "toy"]);
  });

  it("logs nothing once the probe is stopped", () => {
    startPipelineProbe();
    stopPipelineProbe();
    runToy({ ids: "a" });

    expect(stopPipelineProbe()).toStrictEqual([]);
  });

  describe("a target named twice", () => {
    it("writes only the last mention, whatever each was spelled as", () => {
      const { result, log } = runToy({
        ids: "a,b,c",
        keys: { a: "same", c: "same" },
      });

      expect(log.writes).toStrictEqual(["b", "c"]);
      expect(result).toStrictEqual([
        { id: "a", detail: "named again as id c later in this call" },
        { id: "b", wrote: true },
        { id: "c", wrote: true },
      ]);
    });

    it("leaves the earlier entry with no ok", () => {
      const { result } = runToy({ ids: "a,c", keys: { a: "same", c: "same" } });

      expect((result as object[])[0]).not.toHaveProperty("ok");
    });
  });

  describe("a target that names several objects", () => {
    it("replaces every earlier target that shares any of them", () => {
      const { result, log } = runToy({
        ids: "a,b,c,d",
        keys: { a: "x", b: "y", c: "z" },
        manyKeys: { d: ["x", "y"] },
      });

      expect(log.writes).toStrictEqual(["c", "d"]);
      expect(result).toStrictEqual([
        { id: "a", detail: "named again as id d later in this call" },
        { id: "b", detail: "named again as id d later in this call" },
        { id: "c", wrote: true },
        { id: "d", wrote: true },
      ]);
    });
  });

  describe("the whole-call step", () => {
    it("runs once, after the checks and before the first write", () => {
      const log = newToyLog();
      const spec = toySpec(log);

      const result = runWrite(
        { ...spec, before: () => void log.writes.push("before") },
        { ids: "a,b" },
      );

      expect(result as unknown[]).toHaveLength(2);
      expect(log.writes).toStrictEqual(["before", "a", "b"]);
    });

    it("never runs for a call the check refuses", () => {
      const log = newToyLog();
      const spec = toySpec(log);

      expect(() =>
        runWrite(
          { ...spec, before: () => void log.writes.push("before") },
          { ids: "a", refuse: true },
        ),
      ).toThrow("refused by the check");
      expect(log.writes).toStrictEqual([]);
    });

    it("ends the call when it throws, writing no target", () => {
      const log = newToyLog();
      const spec = toySpec(log);

      const before = (): void => {
        throw new Error("tempo refused");
      };

      expect(() => runWrite({ ...spec, before }, { ids: "a" })).toThrow(
        "tempo refused",
      );
      expect(log.writes).toStrictEqual([]);
    });

    it("waits for an async step before the first write", async () => {
      const log = newToyLog();
      const spec = toySpec(log);

      const before = async (): Promise<void> => {
        await Promise.resolve();
        log.writes.push("before");
      };

      await runWrite({ ...spec, before }, { ids: "a" });
      expect(log.writes).toStrictEqual(["before", "a"]);
    });
  });

  describe("a lone skip the tool lets through", () => {
    it("is the call's answer instead of a throw", () => {
      const log = newToyLog();
      const spec = toySpec(log);

      expect(
        runWrite(
          { ...spec, loneSkipThrows: () => false },
          { ids: "a", skip: { a: "nope" } },
        ),
      ).toStrictEqual({ id: "a", ok: false, detail: "nope" });
      // Settled, since the call went through.
      expect(log.settled).toHaveLength(1);
    });

    it("changes nothing for a list", () => {
      const log = newToyLog();
      const spec = toySpec(log);

      expect(
        runWrite(
          { ...spec, loneSkipThrows: () => true },
          { ids: "a,b", skip: { a: "nope" } },
        ),
      ).toStrictEqual([
        { id: "a", ok: false, detail: "nope" },
        { id: "b", wrote: true },
      ]);
    });
  });

  describe("a target that can't be applied", () => {
    it("gets a skip entry in its own slot while the rest are written", () => {
      const { result, log } = runToy({
        ids: "a,b,c",
        skip: { b: "no such b" },
      });

      expect(result).toStrictEqual([
        { id: "a", wrote: true },
        { id: "b", ok: false, detail: "no such b" },
        { id: "c", wrote: true },
      ]);
      expect(log.writes).toStrictEqual(["a", "c"]);
    });

    it("makes a lone call throw its reason", () => {
      expect(() => runToy({ ids: "b", skip: { b: "no such b" } })).toThrow(
        "no such b",
      );
    });
  });

  describe("when Live throws partway", () => {
    it("gives a target nothing of which landed an ok:false entry", () => {
      const { result, log } = runToy({ ids: "a,b,c", failBefore: ["b"] });

      expect(result).toStrictEqual([
        { id: "a", wrote: true },
        { id: "b", ok: false, detail: "b refused" },
        { id: "c", wrote: true },
      ]);
      expect(log.writes).toStrictEqual(["a", "b", "c"]);
    });

    it("keeps the entry of a target that changed something, naming what landed", () => {
      const { result } = runToy({ ids: "a,b,c", failAfter: ["b"] });

      expect(result).toStrictEqual([
        { id: "a", wrote: true },
        { id: "b", detail: "b then failed; already changed: name" },
        { id: "c", wrote: true },
      ]);
    });

    it("keeps the fields the write passed along, naming each change once", () => {
      const { result } = runToy({ ids: "a,b", failAfterWithEntry: ["b"] });

      expect((result as object[])[1]).toStrictEqual({
        id: "b",
        detail: "b then failed; already changed: name, mute",
      });
    });

    it("treats a failed async write the same way", async () => {
      const { result } = runToy({
        ids: "a,b,c",
        slow: ["a", "b", "c"],
        failBefore: ["a"],
        failAfter: ["b"],
      });

      expect(await result).toStrictEqual([
        { id: "a", ok: false, detail: "a refused" },
        { id: "b", detail: "b then failed; already changed: name" },
        { id: "c", wrote: true },
      ]);
    });

    it("makes a lone target nothing of which landed throw", () => {
      expect(() => runToy({ ids: "a", failBefore: ["a"] })).toThrow(
        "a refused",
      );
    });

    it("doesn't make a lone target that changed something throw", () => {
      expect(runToy({ ids: "a", failAfter: ["a"] }).result).toStrictEqual({
        id: "a",
        detail: "a then failed; already changed: name",
      });
    });

    it("rejects for a lone async target nothing of which landed", async () => {
      await expect(
        runToy({ ids: "a", slow: ["a"], failBefore: ["a"] }).result,
      ).rejects.toThrow("a refused");
    });
  });

  describe("the request deadline", () => {
    it("leaves every target it never reached a skip", () => {
      const { result, log } = runToy(
        { ids: "a,b" },
        { deadline: Date.now() - 1 },
      );

      expect(result).toStrictEqual(ranOutOfTime("a", "b"));
      expect(log.writes).toStrictEqual([]);
    });

    it("makes a lone target it never reached throw", () => {
      expect(() => runToy({ ids: "a" }, { deadline: Date.now() - 1 })).toThrow(
        "the request ran out of time",
      );
    });

    it("lets a call with time left through", () => {
      expect(
        runToy({ ids: "a" }, { deadline: Date.now() + 60_000 }).result,
      ).toStrictEqual({ id: "a", wrote: true });
    });
  });

  describe("settling", () => {
    it("tells the tool what happened to each target, in the order named", () => {
      const { log } = runToy({
        ids: "a,b,c,d",
        keys: { a: "same", b: "same" },
        skip: { c: "nope" },
        failBefore: ["d"],
      });

      expect(log.settled).toHaveLength(1);
      expect(log.settled[0]?.outcomes).toStrictEqual([
        "superseded",
        "written",
        "skipped",
        "skipped",
      ]);
    });

    it("is skipped when a lone target was skipped", () => {
      const log = newToyLog();

      expect(() =>
        runWrite(toySpec(log), { ids: "a", skip: { a: "nope" } }),
      ).toThrow("nope");
      expect(log.settled).toStrictEqual([]);
    });
  });

  it("waits for a settle that awaits, and answers once it is done", async () => {
    const log = newToyLog();
    const spec = toySpec(log);
    const done: string[] = [];

    const result = runWrite(
      {
        ...spec,
        settle: async () => {
          await Promise.resolve();
          done.push("settled");
        },
      },
      { ids: "a,b" },
    );

    expect(result).toBeInstanceOf(Promise);
    expect(await result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "b", wrote: true },
    ]);
    expect(done).toStrictEqual(["settled"]);
  });

  it("warns that a param was ignored in the one wording", () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const result = runWrite(
      {
        ...spec,
        settle: (_done, call) => call.ignored("blank id", "path names them"),
      },
      { ids: "a" },
    );

    expect(result).toStrictEqual({ id: "a", wrote: true });
    expect(capturedWarnings()).toStrictEqual([
      "blank id ignored: path names them",
    ]);
  });
});
