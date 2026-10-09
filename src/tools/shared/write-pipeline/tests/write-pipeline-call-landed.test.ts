// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { runWrite } from "../write-pipeline.ts";
import { newToyLog, toySpec } from "./toy-write-spec.ts";

describe("runWrite: what the whole call changed", () => {
  it("says what landed when the whole-call step throws after a change", () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const before: typeof spec.before = (_checked, call) => {
      call.landed("tempo");
      call.landed("tempo");
      call.landed("loop");

      throw new Error("start refused");
    };

    expect(() => runWrite({ ...spec, before }, { ids: "a" })).toThrow(
      "start refused; already changed: tempo, loop",
    );
    expect(log.writes).toStrictEqual([]);
  });

  it("leaves a throw alone when nothing had landed", () => {
    const log = newToyLog();
    const spec = toySpec(log);
    const error = new Error("tempo refused");

    const before = (): void => {
      throw error;
    };

    expect(() => runWrite({ ...spec, before }, { ids: "a" })).toThrow(error);
  });

  it("says what landed when an async whole-call step rejects", async () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const before: typeof spec.before = async (_checked, call) => {
      await Promise.resolve();
      call.landed("tempo");

      throw new Error("start refused");
    };

    await expect(
      Promise.resolve(runWrite({ ...spec, before }, { ids: "a" })),
    ).rejects.toThrow("start refused; already changed: tempo");
  });

  it("names what `before` landed when the settle step throws, after the targets wrote", () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const settle: typeof spec.settle = () => {
      throw new Error("restart refused");
    };

    const before: typeof spec.before = (_checked, call) => {
      call.landed("transport stopped");
    };

    expect(() => runWrite({ ...spec, before, settle }, { ids: "a,b" })).toThrow(
      "restart refused; already changed: transport stopped",
    );
    // The targets had their turns: the throw came after them.
    expect(log.writes).toStrictEqual(["a", "b"]);
  });

  it("says what landed when an async settle step rejects", async () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const settle: typeof spec.settle = async (_done, call) => {
      await Promise.resolve();
      call.landed("loop");

      throw new Error("loop refused");
    };

    await expect(
      Promise.resolve(runWrite({ ...spec, settle }, { ids: "a" })),
    ).rejects.toThrow("loop refused; already changed: loop");
  });
});
