// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AMXD_META_FROZEN,
  AMXD_META_UNFROZEN,
  buildAmxd,
  parseAmxd,
} from "./amxd-container.ts";
import { DEV_BUILD_MARKER } from "../../build-flag-guard.ts";
import { freezeDeviceFromRoot } from "./freeze-device-from-root.ts";
import { readFrozenDirectory } from "./frozen-body-test-helpers.ts";

const MAC_EPOCH_OFFSET = 2_082_844_800;
const UNIX_TIME = 1_700_000_000;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ppal-freeze-device-"));
  mkdirSync(join(root, "max-for-live-device"));
  mkdirSync(join(root, "licenses"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Write a file under the root with a known modified time.
function write(path: string, content: string | Buffer): void {
  writeFileSync(join(root, path), content);
  utimesSync(join(root, path), UNIX_TIME, UNIX_TIME);
}

// Write an unfrozen device whose project lists the given licenses.
function writeDevice(licenses: string[], meta = AMXD_META_UNFROZEN): void {
  const other = Object.fromEntries(
    licenses.map((name) => [
      name,
      { singleton: { projectrelativepath: "../licenses" } },
    ]),
  );
  const patcher = {
    boxes: [
      { box: { maxclass: "newobj", text: "v8 ./adapter.js" } },
      { box: { maxclass: "newobj", text: "node.script ./server.mjs" } },
      { box: { maxclass: "bpatcher", name: "tab.maxpat" } },
    ],
    project: { contents: { patchers: { "tab.maxpat": {} }, other } },
  };

  write(
    "max-for-live-device/Producer_Pal.amxd",
    buildAmxd(meta, Buffer.from(`${JSON.stringify({ patcher })}\0`)),
  );
}

// Read a frozen .amxd's entries.
function readEntries(
  bytes: Buffer,
): Record<string, { type: string; flag: number; mdat: number; data: Buffer }> {
  const { body } = parseAmxd(bytes);
  const entries: Record<
    string,
    { type: string; flag: number; mdat: number; data: Buffer }
  > = {};

  for (const fields of readFrozenDirectory(body)) {
    const offset = fields.of32!.readUInt32BE(0);

    entries[fields.fnam!.toString("latin1").replace(/\0+$/, "")] = {
      type: fields.type!.toString("latin1"),
      flag: fields.flag!.readUInt32BE(0),
      mdat: fields.mdat!.readUInt32BE(0),
      data: body.subarray(offset, offset + fields.sz32!.readUInt32BE(0)),
    };
  }

  return entries;
}

// An entry without its bytes.
function summary(entry?: { type: string; flag: number; mdat: number }): object {
  return { type: entry?.type, flag: entry?.flag, mdat: entry?.mdat };
}

// Write every file the device uses. */
function writeSources(): void {
  write("max-for-live-device/tab.maxpat", JSON.stringify({ patcher: {} }));
  write("max-for-live-device/adapter.js", "adapter");
  write("max-for-live-device/server.mjs", "server");
  write("licenses/a-license", "A");
}

describe("freezeDeviceFromRoot", () => {
  it("freezes a debug build with a warning when allowDevBuild is set", () => {
    writeDevice(["a-license"]);
    writeSources();
    write("max-for-live-device/server.mjs", `/* ${DEV_BUILD_MARKER} */\nbody`);

    const { bytes, warnings } = freezeDeviceFromRoot(root, {
      allowDevBuild: true,
    });

    expect(parseAmxd(bytes).meta).toBe(AMXD_META_FROZEN);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("server.mjs was built with dev-only");
    expect(warnings[0]).toContain("must not ship");
  });

  it("names the opt-out when it refuses a debug build", () => {
    writeDevice(["a-license"]);
    writeSources();
    write("max-for-live-device/server.mjs", DEV_BUILD_MARKER);

    expect(() => freezeDeviceFromRoot(root)).toThrow(
      "ALLOW_DEV_BUILD_FLAGS=true npm run device:freeze",
    );
  });

  it.each(["server.mjs", "adapter.js"])(
    "refuses when %s was built with dev-only flags",
    (name) => {
      writeDevice(["a-license"]);
      writeSources();
      write(`max-for-live-device/${name}`, `/* ${DEV_BUILD_MARKER} */\nbody`);

      expect(() => freezeDeviceFromRoot(root)).toThrow(
        new RegExp(
          `${name} was built with dev-only build flags[^]*release:amxd`,
        ),
      );
    },
  );

  it("writes a frozen device with the main patcher first, then the project and scripts", () => {
    writeDevice(["a-license"]);
    writeSources();
    const { bytes, files, warnings } = freezeDeviceFromRoot(root);

    expect(parseAmxd(bytes).meta).toBe(AMXD_META_FROZEN);
    expect(files.map((f) => f.name)).toStrictEqual([
      "Producer_Pal.amxd",
      "tab.maxpat",
      "server.mjs",
      "adapter.js",
      "a-license",
    ]);
    expect(files[2]?.size).toBe("server".length);
    expect(warnings).toStrictEqual([]);
  });

  it("copies the main patcher verbatim and records types, flags and times", () => {
    writeDevice(["a-license"]);
    writeSources();
    const entries = readEntries(freezeDeviceFromRoot(root).bytes);
    const main = entries["Producer_Pal.amxd"]!.data;

    expect(summary(entries["Producer_Pal.amxd"])).toStrictEqual({
      type: "JSON",
      flag: 0x11,
      mdat: UNIX_TIME + MAC_EPOCH_OFFSET,
    });
    expect(main.toString()).toContain('"node.script ./server.mjs"');
    expect(main.at(-1)).toBe(0);
    expect(summary(entries["tab.maxpat"])).toStrictEqual({
      type: "JSON",
      flag: 0,
      mdat: UNIX_TIME + MAC_EPOCH_OFFSET,
    });
    expect(summary(entries["server.mjs"])).toStrictEqual({
      type: "TEXT",
      flag: 8,
      mdat: UNIX_TIME + MAC_EPOCH_OFFSET,
    });
    expect(summary(entries["adapter.js"])).toStrictEqual({
      type: "TEXT",
      flag: 0,
      mdat: UNIX_TIME + MAC_EPOCH_OFFSET,
    });
    expect(entries["a-license"]!.data.toString()).toBe("A");
    expect(entries["a-license"]!.mdat).toBe(UNIX_TIME + MAC_EPOCH_OFFSET);
  });

  it("types an svg as svg", () => {
    writeDevice([]);
    writeSources();
    write(
      "max-for-live-device/tab.maxpat",
      JSON.stringify({
        patcher: { boxes: [{ box: { maxclass: "fpic", pic: "logo.svg" } }] },
      }),
    );
    write("max-for-live-device/logo.svg", "<svg/>");

    expect(
      readEntries(freezeDeviceFromRoot(root).bytes)["logo.svg"]?.type,
    ).toBe("svg ");
  });

  it("warns about project files that are missing and skips them", () => {
    writeDevice(["a-license", "missing-license"]);
    writeSources();
    const { files, warnings } = freezeDeviceFromRoot(root);

    expect(files.map((f) => f.name)).not.toContain("missing-license");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("missing-license");
  });

  it("refuses an unbuilt device", () => {
    writeDevice([]);
    writeSources();
    rmSync(join(root, "max-for-live-device/server.mjs"));

    expect(() => freezeDeviceFromRoot(root)).toThrow("npm run build");
  });

  it("refuses a device that is already frozen", () => {
    writeDevice([], AMXD_META_FROZEN);

    expect(() => freezeDeviceFromRoot(root)).toThrow("already frozen");
  });
});
