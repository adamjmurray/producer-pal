// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  beginWarningCapture,
  capturedWarnings,
  endWarningCapture,
  suspendWarningCapture,
} from "#src/shared/max/v8-warning-capture.ts";
import { type Call } from "../write-pipeline-types.ts";
import { runWrite } from "../write-pipeline.ts";
import { newToyLog, toySpec } from "./toy-write-spec.ts";

/**
 * An async settle that notes a change, then throws.
 * @param _done - Unused
 * @param call - The call
 */
async function refusingLoop(_done: unknown, call: Call): Promise<void> {
  await Promise.resolve();
  call.landed("loop");

  throw new Error("loop refused");
}

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

  it("keeps the entries and warns, naming what `before` landed, when the settle step throws after the targets wrote", () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const settle: typeof spec.settle = () => {
      throw new Error("restart refused");
    };

    const before: typeof spec.before = (_checked, call) => {
      call.landed("transport stopped");
    };

    const result = runWrite({ ...spec, before, settle }, { ids: "a,b" });

    expect(result).toStrictEqual([
      { id: "a", wrote: true },
      { id: "b", wrote: true },
    ]);
    expect(log.writes).toStrictEqual(["a", "b"]);
    expect(capturedWarnings()).toStrictEqual([
      "Final step failed: restart refused; already changed: transport stopped; results may be incomplete and paths or ids out of date; read them again before relying on them.",
    ]);
  });

  it("throws, naming what `before` landed, when the settle step throws and no target wrote", () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const settle: typeof spec.settle = () => {
      throw new Error("restart refused");
    };

    const before: typeof spec.before = (_checked, call) => {
      call.landed("transport stopped");
    };

    expect(() =>
      runWrite(
        { ...spec, before, settle },
        { ids: "a,b", skip: { a: "gone", b: "gone" } },
      ),
    ).toThrow("restart refused; already changed: transport stopped");
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("keeps the entries and warns when an async settle step rejects", async () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const settle = refusingLoop;

    await expect(
      Promise.resolve(runWrite({ ...spec, settle }, { ids: "a" })),
    ).resolves.toStrictEqual({ id: "a", wrote: true });
    expect(capturedWarnings()).toStrictEqual([
      "Final step failed: loop refused; already changed: loop; results may be incomplete and paths or ids out of date; read them again before relying on them.",
    ]);
  });

  it("puts the warning on its own request's response when another request ran meanwhile", async () => {
    const log = newToyLog();
    const spec = toySpec(log);
    const mine = beginWarningCapture();

    const settle: typeof spec.settle = async () => {
      await suspendWarningCapture(Promise.resolve());

      throw new Error("loop refused");
    };

    const run = Promise.resolve(runWrite({ ...spec, settle }, { ids: "a" }));
    // The other request starts while this one is parked, and takes the capture.
    const other = beginWarningCapture();

    await run;

    expect(endWarningCapture(mine)).toStrictEqual([
      "Final step failed: loop refused; results may be incomplete and paths or ids out of date; read them again before relying on them.",
    ]);
    expect(endWarningCapture(other)).toStrictEqual([]);
  });

  it("throws when an async settle step rejects and no target wrote", async () => {
    const log = newToyLog();
    const spec = toySpec(log);

    const settle = refusingLoop;

    await expect(
      Promise.resolve(
        runWrite({ ...spec, settle }, { ids: "a,b", skip: { a: "x", b: "x" } }),
      ),
    ).rejects.toThrow("loop refused; already changed: loop");
  });
});
