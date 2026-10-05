// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fourCC } from "../../library-filters.ts";
import { findPresetFiles } from "../../query/preset-files.ts";

const { findLiveFilesDbPath } = vi.hoisted(() => ({
  findLiveFilesDbPath: vi.fn<() => Promise<string | null>>(),
}));

vi.mock(import("../../live-db-path.ts"), () => ({
  findLiveFilesDbPath,
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
  setRunningLiveMajor: vi.fn(),
}));

const FLDR = fourCC("fldr");
const ADV = fourCC("adv-");
const ADG = fourCC("adg-");
const WAV = fourCC("wav-");

const DRUM_RACK = "device:ableton:instr:DrumGroupDevice";
const WAVETABLE = "device:ableton:instr:InstrumentVector";
const ANALOG = "device:ableton:instr:UltraAnalog";
const DRIFT = "device:ableton:instr:Drift";
const OPERATOR = "device:ableton:instr:Operator";
const MELD = "device:ableton:instr:InstrumentMeld";
const INSTRUMENT_RACK = "device:ableton:instr:InstrumentGroupDevice";
const REVERB = "device:ableton:audiofx:Reverb";
const PLUGIN_DEVICE = "device:au:instr:1:2:3";

let dir: string;
let dbPath: string;

type Row = [
  id: number,
  parent: number,
  name: string,
  type: number,
  options?: {
    place?: number;
    flags?: number;
    deviceType?: number;
    deviceId?: string;
  },
];

/**
 * Write a files DB. Place 10 is the User Library, 20 a pack and 70 a plug-in
 * preset folder; the rows under 90 stand in for another installed Live, which
 * isn't a place.
 *
 * @returns Path to the DB
 */
function writeDb(): string {
  const path = join(dir, "Live-files-12300.db");
  const db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE files (file_id INTEGER PRIMARY KEY, parent_id INTEGER,
      name TEXT, file_type INTEGER, place_id INTEGER DEFAULT 0,
      flags INTEGER DEFAULT 3, device_type INTEGER DEFAULT 0, device_id TEXT);
    CREATE TABLE places (file_id INTEGER PRIMARY KEY, folder_kind INTEGER);
    INSERT INTO places VALUES (10, 1), (20, 0), (70, 5);
  `);

  const rows: Row[] = [
    [1, 0, "/", FLDR],
    [2, 1, "Users", FLDR],
    [3, 2, "me", FLDR],
    [10, 3, "User Library", FLDR],
    [11, 10, "Presets", FLDR],
    [12, 11, "Wavetable", FLDR],
    [13, 11, "Analog", FLDR],
    [14, 11, "Reverb", FLDR],
    [
      15,
      12,
      "Bass.adv",
      ADV,
      { place: 10, deviceType: 1, deviceId: WAVETABLE },
    ],
    [
      16,
      13,
      "Warm Pad.adv",
      ADV,
      { place: 10, deviceType: 1, deviceId: ANALOG },
    ],
    [17, 14, "Hall.adv", ADV, { place: 10, deviceType: 2, deviceId: REVERB }],
    [
      18,
      12,
      "Rack Around.adg",
      ADG,
      {
        place: 10,
        deviceType: 1,
        deviceId: "device:ableton:instr:InstrumentGroupDevice",
      },
    ],
    [20, 3, "Drum Pack", FLDR],
    [21, 20, "Drums", FLDR],
    [
      22,
      21,
      "505 Kit.adg",
      ADG,
      { place: 20, deviceType: 1, deviceId: DRUM_RACK },
    ],
    [
      23,
      21,
      "Warm Pad.adv",
      ADV,
      { place: 20, deviceType: 1, deviceId: WAVETABLE },
    ],
    [24, 21, "505 Kit.wav", WAV, { place: 20 }],
    [
      25,
      21,
      "Kit/ Two.adg",
      ADG,
      { place: 20, deviceType: 1, deviceId: DRUM_RACK },
    ],
    [
      26,
      21,
      "Hidden Kit.adg",
      ADG,
      { place: 20, flags: 0, deviceType: 1, deviceId: DRUM_RACK },
    ],
    [70, 3, "Plugin Presets", FLDR],
    [71, 70, "Sample Kit.adg", ADG, { place: 70 }],
    [
      72,
      70,
      "Linked Kit.adg",
      ADG,
      { place: 70, deviceType: 1, deviceId: PLUGIN_DEVICE },
    ],
    [90, 1, "Other Live", FLDR],
    // Drift: two Drift presets and one Operator preset in its folder, and
    // three Analog presets too deep to count.
    [30, 11, "Drift", FLDR],
    [31, 30, "Smack.adv", ADV, { place: 10, deviceType: 1, deviceId: DRIFT }],
    [32, 30, "Filler.adv", ADV, { place: 10, deviceType: 1, deviceId: DRIFT }],
    [33, 30, "Odd.adv", ADV, { place: 10, deviceType: 1, deviceId: OPERATOR }],
    [34, 30, "Deep", FLDR],
    [35, 34, "Deeper", FLDR],
    [36, 35, "Deep 1.adv", ADV, { place: 10, deviceType: 1, deviceId: ANALOG }],
    [37, 35, "Deep 2.adv", ADV, { place: 10, deviceType: 1, deviceId: ANALOG }],
    [38, 35, "Deep 3.adv", ADV, { place: 10, deviceType: 1, deviceId: ANALOG }],
    [39, 11, "Elsewhere", FLDR],
    [
      40,
      39,
      "Smack.adv",
      ADV,
      { place: 10, deviceType: 1, deviceId: OPERATOR },
    ],
    [
      41,
      39,
      "Smack.adg",
      ADG,
      { place: 10, deviceType: 1, deviceId: DRUM_RACK },
    ],
    // Meld: two racks and one preset in its folder.
    [50, 11, "Meld", FLDR],
    [
      51,
      50,
      "Rack 1.adg",
      ADG,
      { place: 10, deviceType: 1, deviceId: INSTRUMENT_RACK },
    ],
    [
      52,
      50,
      "Rack 2.adg",
      ADG,
      { place: 10, deviceType: 1, deviceId: INSTRUMENT_RACK },
    ],
    [53, 50, "Pluck.adv", ADV, { place: 10, deviceType: 1, deviceId: MELD }],
    [
      54,
      39,
      "Pluck.adv",
      ADV,
      { place: 10, deviceType: 1, deviceId: OPERATOR },
    ],
    // The same file listed twice.
    [
      60,
      21,
      "Twice.adg",
      ADG,
      { place: 20, deviceType: 1, deviceId: DRUM_RACK },
    ],
    [
      61,
      21,
      "Twice.adg",
      ADG,
      { place: 20, deviceType: 1, deviceId: DRUM_RACK },
    ],
    [91, 90, "505 Kit.adg", ADG, { deviceType: 1, deviceId: DRUM_RACK }],
  ];

  const insert = db.prepare(
    "INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  for (const [id, parent, name, type, o] of rows) {
    insert.run(
      id,
      parent,
      name,
      type,
      o?.place ?? 0,
      o?.flags ?? 3,
      o?.deviceType ?? 0,
      o?.deviceId ?? null,
    );
  }

  db.close();

  return path;
}

describe("findPresetFiles", () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ppal-preset-files-"));
    dbPath = writeDb();
  });

  beforeEach(() => {
    findLiveFilesDbPath.mockResolvedValue(dbPath);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves out files in preset folders that no plug-in owns, as Live's browser does", async () => {
    expect(await findPresetFiles({ name: "sample kit" })).toStrictEqual([]);
  });

  it("lists presets in preset folders that a plug-in owns", async () => {
    expect(await findPresetFiles({ name: "linked kit" })).toStrictEqual([
      {
        name: "Linked Kit.adg",
        path: "/Users/me/Plugin Presets/Linked Kit.adg",
      },
    ]);
  });

  it("finds a preset by name, with its path", async () => {
    expect(await findPresetFiles({ name: "505 kit" })).toStrictEqual([
      {
        name: "505 Kit.adg",
        path: "/Users/me/Drum Pack/Drums/505 Kit.adg",
      },
    ]);
  });

  it("skips other files, other Live installs and what Live's views hide", async () => {
    expect(await findPresetFiles({ name: "hidden kit" })).toStrictEqual([]);
    expect(await findPresetFiles({ name: "505 kit.wav" })).toStrictEqual([]);
  });

  it("matches the whole name only", async () => {
    expect(await findPresetFiles({ name: "505" })).toStrictEqual([]);
  });

  it("reads a colon in the name as the slash Live stores", async () => {
    const files = await findPresetFiles({ name: "kit: two" });

    expect(files?.map(({ path }) => path)).toStrictEqual([
      "/Users/me/Drum Pack/Drums/Kit: Two.adg",
    ]);
  });

  it("lists every file with that name, by path", async () => {
    const files = await findPresetFiles({ name: "warm pad" });

    expect(files?.map(({ path }) => path)).toStrictEqual([
      "/Users/me/Drum Pack/Drums/Warm Pad.adv",
      "/Users/me/User Library/Presets/Analog/Warm Pad.adv",
    ]);
  });

  it("keeps to a rack's class when the device is a rack", async () => {
    const files = await findPresetFiles({
      name: "505 kit",
      device: { name: "Drum Rack", kind: "instrument" },
    });
    const none = await findPresetFiles({
      name: "505 kit",
      device: { name: "Instrument Rack", kind: "instrument" },
    });

    expect(files).toHaveLength(1);
    expect(none).toStrictEqual([]);
  });

  it("keeps to the class of the presets under the device's folder", async () => {
    const files = await findPresetFiles({
      name: "warm pad",
      device: { name: "wavetable", kind: "instrument" },
    });

    expect(files?.map(({ path }) => path)).toStrictEqual([
      "/Users/me/Drum Pack/Drums/Warm Pad.adv",
    ]);
  });

  it("finds nothing for a device with no folder to learn its class from", async () => {
    expect(
      await findPresetFiles({
        name: "warm pad",
        device: { name: "Operator", kind: "instrument" },
      }),
    ).toStrictEqual([]);
  });

  it("takes the class most presets in the device's folder share", async () => {
    // One Operator preset sits in Drift's folder; three Analog ones sit too
    // deep to vote.
    const files = await findPresetFiles({
      name: "smack",
      device: { name: "Drift", kind: "instrument" },
    });

    expect(files?.map(({ path }) => path)).toStrictEqual([
      "/Users/me/User Library/Presets/Drift/Smack.adv",
    ]);
  });

  it("doesn't let racks around a device outvote its presets", async () => {
    const files = await findPresetFiles({
      name: "pluck",
      device: { name: "Meld", kind: "instrument" },
    });

    expect(files?.map(({ path }) => path)).toStrictEqual([
      "/Users/me/User Library/Presets/Meld/Pluck.adv",
    ]);
  });

  it("lists a file listed twice once", async () => {
    expect(await findPresetFiles({ name: "twice" })).toStrictEqual([
      { name: "Twice.adg", path: "/Users/me/Drum Pack/Drums/Twice.adg" },
    ]);
  });

  it("ignores a folder of another kind of device", async () => {
    expect(
      await findPresetFiles({
        name: "hall",
        device: { name: "Reverb", kind: "instrument" },
      }),
    ).toStrictEqual([]);
  });

  it("is null when there is no database", async () => {
    findLiveFilesDbPath.mockResolvedValue(null);

    expect(await findPresetFiles({ name: "505 kit" })).toBeNull();
  });

  it("is null when the database can't be read", async () => {
    findLiveFilesDbPath.mockResolvedValue(join(dir, "missing.db"));

    expect(await findPresetFiles({ name: "505 kit" })).toBeNull();
  });
});
