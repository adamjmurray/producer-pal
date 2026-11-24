// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

interface Landed {
  ok: boolean;
  display?: string;
  scale?: number;
  value?: number;
  error?: string;
}

// One param, "P", whose display is a function of its 0-1 value. `start` is
// where it sits before the write.
function writeTo(
  display: (value: number) => string,
  start: number,
  entry: object,
): Landed {
  let current = start;
  const rig = loadWrapper("Plug", (...args) => {
    if (args[1] === "get") {
      rig.run(`pval(1, ${current}, ${JSON.stringify(display(current))})`);
    } else if (typeof args[2] === "number") {
      current = args[2];
    }
  });

  rig.run('pname("P")');

  const [result] = rig.run(
    `writeParams(${JSON.stringify([{ name: "P", ...entry }])})`,
  ) as Landed[];

  return result as Landed;
}

const fixed = (n: number): string => n.toFixed(2);

// 20 Hz to 20 kHz, in kHz from 1000 Hz up.
const hzOrKhz = (v: number): string => {
  const hz = 20 * 1000 ** v;

  return hz < 1000 ? `${hz.toFixed(1)} Hz` : `${(hz / 1000).toFixed(2)} kHz`;
};

const khz = (v: number): string => `${(0.02 + v * 19.98).toFixed(3)} kHz`;
const seconds = (v: number): string => `${(v * 4).toFixed(3)} s`;
const decibels = (v: number): string => `${(v * 72 - 60).toFixed(2)} dB`;
const plain = (v: number): string => (v * 100).toFixed(2);

function shownNumber(landed: Landed): number {
  return Number.parseFloat(landed.display ?? "NaN");
}

describe("wrapper write of a bare number", () => {
  it("reads it in kHz when the param shows kHz", () => {
    const landed = writeTo(khz, 0.5, { text: "3", number: 3, bare: true });

    expect(landed.ok).toBe(true);
    expect(landed.display).toMatch(/kHz$/);
    expect(shownNumber(landed)).toBeCloseTo(3, 2);
    expect(landed.scale).toBe(1000);
  });

  it("reads it in thousands when the param shows a bare k", () => {
    const landed = writeTo((v) => `${(0.02 + v * 19.98).toFixed(3)}k`, 0.5, {
      text: "3",
      number: 3,
      bare: true,
    });

    expect(landed.ok).toBe(true);
    expect(shownNumber(landed)).toBeCloseTo(3, 2);
    expect(landed.scale).toBe(1000);
  });

  it("reads it in s when the param shows s", () => {
    const landed = writeTo(seconds, 0.2, {
      text: "0.8",
      number: 0.8,
      bare: true,
    });

    expect(landed.display).toMatch(/s$/);
    expect(shownNumber(landed)).toBeCloseTo(0.8, 2);
    expect(landed.scale).toBe(1000);
  });

  it("reads it in Hz when the param shows Hz", () => {
    const landed = writeTo(hzOrKhz, 0.1, {
      text: "300",
      number: 300,
      bare: true,
    });

    expect(landed.display).toMatch(/Hz$/);
    expect(shownNumber(landed)).toBeCloseTo(300, 0);
    expect(landed.scale).toBeUndefined();
  });

  it("goes by the unit shown before the write when the range switches to kHz", () => {
    const fromKhz = writeTo(hzOrKhz, 0.9, { text: "2", number: 2, bare: true });

    expect(fromKhz.display).toMatch(/kHz$/);
    expect(shownNumber(fromKhz)).toBeCloseTo(2, 1);

    const fromHz = writeTo(hzOrKhz, 0.1, {
      text: "2000",
      number: 2000,
      bare: true,
    });

    expect(fromHz.display).toMatch(/kHz$/);
    expect(shownNumber(fromHz)).toBeCloseTo(2000 / 1000, 1);
  });

  it("clamps at the end of the range, in the unit shown", () => {
    const landed = writeTo(khz, 0.5, { text: "50", number: 50, bare: true });

    expect(landed.display).toBe("20.000 kHz");
  });

  it("leaves a dB display alone", () => {
    const landed = writeTo(decibels, 0.5, {
      text: "-6",
      number: -6,
      bare: true,
    });

    expect(shownNumber(landed)).toBeCloseTo(-6, 1);
    expect(landed.scale).toBeUndefined();
  });

  it("leaves a plain number display alone", () => {
    const landed = writeTo(plain, 0.5, { text: "75", number: 75, bare: true });

    expect(shownNumber(landed)).toBeCloseTo(75, 1);
    expect(landed.scale).toBeUndefined();
  });

  it("leaves a display with no number before the write alone", () => {
    const landed = writeTo(
      (v) => (v < 0.1 ? "Off" : `${(v * 100).toFixed(2)} ms`),
      0,
      { text: "50", number: 50, bare: true },
    );

    expect(shownNumber(landed)).toBeCloseTo(50, 1);
    expect(landed.scale).toBeUndefined();
  });

  it("takes text that matches a display before any unit reading", () => {
    const landed = writeTo(fixed, 0.5, {
      text: "0.25",
      number: 0.25,
      bare: true,
    });

    expect(landed.display).toBe("0.25");
    expect(landed.scale).toBeUndefined();
  });
});

describe("wrapper write of a number with a unit", () => {
  it("keeps 3 kHz on a kHz display", () => {
    const landed = writeTo(khz, 0.5, { text: "3 kHz", number: 3000 });

    expect(shownNumber(landed)).toBeCloseTo(3, 2);
    expect(landed.scale).toBeUndefined();
  });

  it("keeps 3000 Hz on a kHz display", () => {
    const landed = writeTo(khz, 0.5, { text: "3000 Hz", number: 3000 });

    expect(shownNumber(landed)).toBeCloseTo(3, 2);
  });

  it("keeps 800 ms on an s display", () => {
    const landed = writeTo(seconds, 0.2, { text: "800 ms", number: 800 });

    expect(shownNumber(landed)).toBeCloseTo(0.8, 2);
  });

  it("keeps 0.8 s on an s display", () => {
    const landed = writeTo(seconds, 0.2, { text: "0.8 s", number: 800 });

    expect(shownNumber(landed)).toBeCloseTo(0.8, 2);
  });

  it("refuses a unit the param doesn't show, leaving it as it was", () => {
    let current = 0.3;
    const rig = loadWrapper("Plug", (...args) => {
      if (args[1] === "get") {
        rig.run(`pval(1, ${current}, ${JSON.stringify(hzOrKhz(current))})`);
      } else if (typeof args[2] === "number") {
        current = args[2];
      }
    });

    rig.run('pname("P")');

    // Through JSON, as a reply goes: the result is from another realm.
    const [landed] = JSON.parse(
      rig.run(
        'JSON.stringify(writeParams([{ name: "P", text: "500 ms", number: 500 }]))',
      ) as string,
    ) as Landed[];

    expect(landed).toStrictEqual({
      ok: false,
      kind: "nomatch",
      error: "wrong unit: the param shows Hz/kHz, not ms",
    });
    expect(current).toBe(0.3);
  });

  it("finds a number between the last one shown and an end showing none", () => {
    const landed = writeTo((v) => (v === 1 ? "+inf dB" : decibels(v)), 0.5, {
      text: "11.9 dB",
      number: 11.9,
    });

    expect(shownNumber(landed)).toBeCloseTo(11.9, 1);
  });

  it("takes any unit on a param whose unit it doesn't know", () => {
    const landed = writeTo((v) => `${(v * 10).toFixed(2)} x`, 0.5, {
      text: "50 %",
      number: 50,
    });

    expect(landed.ok).toBe(true);
    expect(landed.display).toBe("10.00 x");
  });
});

describe("wrapper write that can't read the param", () => {
  interface Rig2 {
    run: (code: string) => unknown;
    sent: unknown[];
    current: () => number;
  }

  // One param "P" at 0.3. `answer` says whether the nth `get` is answered.
  function rigWith(answer: (n: number) => boolean | "throw"): Rig2 {
    let current = 0.3;
    let gets = 0;
    const sent: unknown[] = [];
    const rig = loadWrapper("Plug", (...args) => {
      if (args[1] === "get") {
        const reply = answer(++gets);

        if (reply === "throw") {
          throw new Error("vst~ gone");
        }

        if (reply) {
          rig.run(`pval(1, ${current}, ${JSON.stringify(decibels(current))})`);
        }
      } else if (args[1] === 1) {
        sent.push(args[2]);
        current = args[2] as number;
      }
    });

    rig.run('pname("P")');

    return { run: rig.run, sent, current: () => current };
  }

  const write = (text: string, number?: number): string =>
    `JSON.stringify(writeParams([{ name: "P", text: ${JSON.stringify(text)}, number: ${number} }]))`;

  it("moves nothing when the first read gets no answer", () => {
    const rig = rigWith((n) => n > 1);

    const [landed] = JSON.parse(rig.run(write("Banana")) as string) as Landed[];

    expect(landed).toStrictEqual({
      ok: false,
      kind: "unreadable",
      error: "the plug-in gave no value for this param, so it wasn't moved",
    });
    expect(rig.sent).toStrictEqual([]);
    expect(rig.current()).toBe(0.3);
  });

  it("puts the param back when a read throws mid-search", () => {
    const rig = rigWith((n) => (n === 50 ? "throw" : true));

    const [landed] = JSON.parse(rig.run(write("-6 dB")) as string) as Landed[];

    expect(landed).toStrictEqual({
      ok: false,
      kind: "failed",
      error: "vst~ gone",
    });
    expect(rig.sent.length).toBeGreaterThan(0);
    expect(rig.current()).toBe(0.3);
  });

  it("leaves the param at the written value on success", () => {
    const rig = rigWith(() => true);

    const [landed] = JSON.parse(
      rig.run(write("-6 dB", -6)) as string,
    ) as Landed[];

    expect(landed?.ok).toBe(true);
    expect(rig.current()).toBeCloseTo(0.75, 5);
    expect(rig.current()).toBe(landed?.value);
  });

  it("puts the param back when nothing matches", () => {
    const rig = rigWith(() => true);

    const [landed] = JSON.parse(rig.run(write("Banana")) as string) as Landed[];

    expect(landed?.ok).toBe(false);
    expect(landed?.error).toContain("nothing displays");
    expect(rig.sent.every((value) => Number.isFinite(value))).toBe(true);
    expect(rig.current()).toBe(0.3);
  });
});
