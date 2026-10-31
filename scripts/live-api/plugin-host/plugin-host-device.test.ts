// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPluginHostDevice,
  extractWrapperCode,
} from "./plugin-host-device.ts";

const dir = join(
  import.meta.dirname,
  "../../../max-for-live-device/plugin-host",
);
const CODE = "const SLOT_COUNT = 4;\n";

function amxd(patcher: string): Buffer {
  const body = Buffer.from(`{"patcher": ${patcher}}\0`);
  const header = Buffer.alloc(32);

  header.write("ampf", 0, "latin1");
  header.write("ptch", 24, "latin1");
  header.writeUInt32LE(body.length, 28);

  return Buffer.concat([header, body]);
}

function parse(file: Buffer): {
  patcher: {
    boxes: { box: { id: string; code?: string } }[];
    lines: unknown[];
    project: unknown;
  };
} {
  return JSON.parse(file.toString("utf8", 32).replace(/\0$/, ""));
}

// 20.0 checks numbers keep their source text
const stale = amxd(`{
  "boxes": [
    { "box": { "id": "code", "maxclass": "v8.codebox", "code": "old" } },
    { "box": { "id": "slotdial999", "maxclass": "live.dial" } },
    { "box": { "id": "other", "maxclass": "newobj", "patching_rect": [20.0, 1.5] } }
  ],
  "lines": [
    { "patchline": { "source": ["slotdial999", 0], "destination": ["code", 0] } },
    { "patchline": { "source": ["other", 0], "destination": ["code", 0] } }
  ],
  "project": { "searchpath": {} }
}`);

describe("buildPluginHostDevice", () => {
  it.each(["PPal Plug-in Effect.amxd", "PPal Plug-in Instrument.amxd"])(
    "%s is already built from wrapper.js (run npm run plugin-host:build)",
    (device) => {
      const file = readFileSync(join(dir, device));
      const code = readFileSync(join(dir, "wrapper.js"), "utf8");

      expect(buildPluginHostDevice(file, code).equals(file)).toBe(true);
    },
  );

  it("replaces the code and stale slot boxes, keeping everything else", () => {
    const built = buildPluginHostDevice(stale, CODE);
    const { patcher } = parse(built);
    const ids = patcher.boxes.map((b) => b.box.id);

    expect(patcher.boxes[0]?.box.code).toBe("const SLOT_COUNT = 128;\n");
    expect(ids).not.toContain("slotdial999");
    expect(ids).toContain("slotdial128");
    expect(ids.filter((id) => id === "vstslots")).toHaveLength(1);
    expect(patcher.lines).toHaveLength(1 + 128 * 2);
    expect(patcher.project).toStrictEqual({ searchpath: {} });
    expect(built.readUInt32LE(28)).toBe(built.length - 32);
    expect(built.toString()).toMatch(/\[\s+20\.0,\s+1\.5\s+\]/);
    expect(built.toString()).toContain(
      '"parameter_longname": "Automation 001"',
    );
    expect(buildPluginHostDevice(built, CODE).equals(built)).toBe(true);
  });

  it("refuses wrapper code without one SLOT_COUNT line", () => {
    expect(() => buildPluginHostDevice(stale, "let x;")).toThrow("SLOT_COUNT");
  });

  it("refuses a file that isn't an .amxd patcher", () => {
    expect(() => buildPluginHostDevice(Buffer.alloc(40), CODE)).toThrow(
      "not an .amxd",
    );
  });
});

describe("extractWrapperCode", () => {
  it("reads the code box", () => {
    expect(extractWrapperCode(stale)).toBe("old");
  });

  it("refuses a device without a code box", () => {
    expect(() =>
      extractWrapperCode(amxd(`{ "boxes": [], "lines": [] }`)),
    ).toThrow("no v8.codebox");
  });
});
