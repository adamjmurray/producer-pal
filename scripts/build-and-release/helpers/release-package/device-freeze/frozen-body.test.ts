// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { buildFrozenBody, type FrozenEntry } from "./frozen-body.ts";
import { readFrozenDirectory } from "./frozen-body-test-helpers.ts";

const entries: FrozenEntry[] = [
  {
    name: "a.amxd",
    type: "JSON",
    data: Buffer.from("{}\0"),
    flag: 0x11,
    mdat: 100,
  },
  { name: "run.mjs", type: "TEXT", data: Buffer.from("xy"), flag: 8, mdat: 7 },
];

describe("buildFrozenBody", () => {
  const body = buildFrozenBody(entries);

  it("starts with the header and puts files back to back", () => {
    expect(body.toString("latin1", 0, 4)).toBe("mx@c");
    expect(body.readUInt32BE(4)).toBe(16);
    expect(body.readUInt32BE(8)).toBe(0);
    expect(body.readUInt32BE(12)).toBe(16 + 3 + 2);
    expect(body.subarray(16, 21).toString()).toBe("{}\0xy");
  });

  it("lists each file with size and offset", () => {
    const [first, second] = readFrozenDirectory(body);

    expect(first?.sz32?.readUInt32BE(0)).toBe(3);
    expect(first?.of32?.readUInt32BE(0)).toBe(16);
    expect(second?.sz32?.readUInt32BE(0)).toBe(2);
    expect(second?.of32?.readUInt32BE(0)).toBe(19);
  });

  it("lists type, flag, version and time", () => {
    const [first, second] = readFrozenDirectory(body);

    expect(first?.type?.toString()).toBe("JSON");
    expect(first?.flag?.readUInt32BE(0)).toBe(0x11);
    expect(first?.vers?.readUInt32BE(0)).toBe(0);
    expect(first?.mdat?.readUInt32BE(0)).toBe(100);
    expect(second?.type?.toString()).toBe("TEXT");
    expect(second?.flag?.readUInt32BE(0)).toBe(8);
    expect(second?.mdat?.readUInt32BE(0)).toBe(7);
  });

  it("null-terminates names and pads them to a multiple of 4 bytes", () => {
    const names = readFrozenDirectory(body).map((fields) => fields.fnam);

    expect(names[0]?.toString("latin1")).toBe("a.amxd\0\0");
    expect(names[1]?.toString("latin1")).toBe("run.mjs\0");
    expect(
      readFrozenDirectory(
        buildFrozenBody([{ ...entries[0]!, name: "abc" }]),
      )[0]?.fnam?.toString("latin1"),
    ).toBe("abc\0");
    expect(
      readFrozenDirectory(
        buildFrozenBody([{ ...entries[0]!, name: "abcd" }]),
      )[0]?.fnam?.toString("latin1"),
    ).toBe("abcd\0\0\0\0");
  });

  it("frames the directory with a length that covers the whole chunk", () => {
    const start = body.readUInt32BE(12);

    expect(body.toString("latin1", start, start + 4)).toBe("dlst");
    expect(start + body.readUInt32BE(start + 4)).toBe(body.length);
    expect(body.toString("latin1", start + 8, start + 12)).toBe("dire");
  });
});
