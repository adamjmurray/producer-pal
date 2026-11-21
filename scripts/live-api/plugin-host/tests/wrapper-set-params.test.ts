// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

describe("wrapper setParams", () => {
  function rigWithParams(): {
    run: (code: string) => unknown;
    sent: unknown[][];
  } {
    const sent: unknown[][] = [];
    const rig = loadWrapper("Plug", (...args) => {
      sent.push(args);
    });

    rig.run('pname("P")');
    rig.run('pname("Q")');

    return { run: rig.run, sent };
  }

  it("sets a param by index and by name", () => {
    const { run, sent } = rigWithParams();

    run('setParams([{ index: 2, value: 0.5 }, { name: "P", value: 0.25 }])');

    expect(sent.filter((args) => typeof args[1] === "number")).toStrictEqual([
      [0, 2, 0.5],
      [0, 1, 0.25],
    ]);
  });

  it.each([["abc"], [0], [3], [1.5], [-1]])(
    "refuses index %j without sending it to the plug-in",
    (index) => {
      const { run, sent } = rigWithParams();

      expect(() =>
        run(`setParams([{ index: ${JSON.stringify(index)}, value: 0.5 }])`),
      ).toThrow(`no param ${index}`);
      expect(sent.filter((args) => typeof args[1] === "number")).toStrictEqual(
        [],
      );
    },
  );
});
