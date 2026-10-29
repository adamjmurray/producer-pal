// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { resolvePlugin } from "../../../query/plugins/resolve-plugin.ts";

vi.mock(import("../../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../../../live-db-path.ts");

const DIR = "/Library/Audio/Plug-Ins";

// [name, vendor, enabled, dev_identifier, module path]
type Seed = [string, string, number, string, string];

const SEEDS: Seed[] = [
  ["Repro-1", "u-he", 1, "device:vst3:instr:a", `${DIR}/VST3/Repro-1.vst3`],
  ["Repro-5", "u-he", 1, "device:vst3:instr:b", `${DIR}/VST3/Repro-1.vst3`],
  [
    "Serum 2",
    "Xfer Records",
    1,
    "device:vst3:instr:c",
    `${DIR}/VST3/Serum2.vst3`,
  ],
  [
    "Serum 2 FX",
    "Xfer Records",
    1,
    "device:vst3:audiofx:d",
    `${DIR}/VST3/Serum2.vst3`,
  ],
  [
    "Pro-Q 4",
    "FabFilter",
    1,
    "device:vst3:audiofx:e",
    `${DIR}/VST3/FabFilter Pro-Q 4.vst3`,
  ],
  [
    "Pro-Q 3",
    "FabFilter",
    1,
    "device:vst3:audiofx:f",
    `${DIR}/VST3/FabFilter Pro-Q 3.vst3`,
  ],
  [
    "Old Verb",
    "Legacy",
    0,
    "device:vst3:audiofx:g",
    `${DIR}/VST3/OldVerb.vst3`,
  ],
  [
    "Valhalla Room",
    "Valhalla DSP",
    1,
    "device:au:audiofx:h",
    `${DIR}/Components/ValhallaRoom.component`,
  ],
  ["Twin", "A Co", 1, "device:vst3:instr:i", `${DIR}/VST3/TwinA.vst3`],
  ["Twin", "B Co", 1, "device:vst3:instr:j", `${DIR}/VST3/TwinB.vst3`],
  ["Lonely", "A Co", 1, "device:vst3:instr:k", `${DIR}/VST3/Lonely.vst3`],
  ["Lonely Ghost", "A Co", 0, "device:vst3:instr:l", `${DIR}/VST3/Lonely.vst3`],
  ["Mystery", "Nobody", 1, "device:vst3:", `${DIR}/VST3/Mystery.vst3`],
];

/**
 * Build a plug-in database with the plugins and plugin_modules tables.
 *
 * @param dir - Folder to put it in
 * @param withModules - false leaves out plugin_modules (older Live layouts)
 * @returns The database path
 */
function buildDb(dir: string, withModules: boolean): string {
  const dbPath = join(dir, withModules ? "Live-plugins-1.db" : "Live-old.db");
  const db = new DatabaseSync(dbPath);

  db.exec(
    `CREATE TABLE plugins (name TEXT, vendor TEXT, enabled INTEGER,
       dev_identifier TEXT, module_id INTEGER);
     CREATE TABLE ${withModules ? "plugin_modules" : "other"}
       (module_id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT);`,
  );

  if (withModules) {
    const addModule = db.prepare(
      "INSERT INTO plugin_modules (path) VALUES (?)",
    );
    const addPlugin = db.prepare("INSERT INTO plugins VALUES (?, ?, ?, ?, ?)");
    const ids = new Map<string, number>();

    for (const [name, vendor, enabled, devId, path] of SEEDS) {
      let id = ids.get(path);

      if (id == null) {
        id = Number(addModule.run(path).lastInsertRowid);
        ids.set(path, id);
      }

      addPlugin.run(name, vendor, enabled, devId, id);
    }
  }

  db.close();

  return dbPath;
}

describe("resolvePlugin", () => {
  let dir: string;
  let goodDb: string;
  let oldDb: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ppal-resolve-plugin-"));
    goodDb = buildDb(dir, true);
    oldDb = buildDb(dir, false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Point plug-in lookup at a database.
   *
   * @param path - Database path, or null for none
   */
  function useDb(path: string | null): void {
    vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(path);
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);
  }

  it("finds an instrument and its bundle", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "Serum 2" })).resolves.toStrictEqual({
      name: "Serum 2",
      vendor: "Xfer Records",
      category: "instrument",
      file: `${DIR}/VST3/Serum2.vst3`,
      shared: true,
    });
  });

  it("says a bundle is not shared when it holds one plug-in", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "Pro-Q 4" })).resolves.toStrictEqual(
      expect.objectContaining({ shared: false }),
    );
  });

  it("does not count a disabled plug-in as sharing the bundle", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "Lonely" })).resolves.toStrictEqual(
      expect.objectContaining({ shared: false }),
    );
  });

  it("tells two plug-ins in one bundle apart", async () => {
    useDb(goodDb);

    const fx = await resolvePlugin({ name: "Serum 2 FX" });
    const repro5 = await resolvePlugin({ name: "Repro-5" });

    expect(fx).toStrictEqual(
      expect.objectContaining({
        category: "audiofx",
        file: `${DIR}/VST3/Serum2.vst3`,
      }),
    );
    expect(repro5).toStrictEqual(
      expect.objectContaining({
        name: "Repro-5",
        file: `${DIR}/VST3/Repro-1.vst3`,
      }),
    );
  });

  it("ignores case and surrounding spaces, and returns the installed spelling", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "  pro-q 4 " })).resolves.toStrictEqual(
      expect.objectContaining({ name: "Pro-Q 4", category: "audiofx" }),
    );
  });

  it("says only VST3 can be hosted when the plug-in is another format", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "Valhalla Room" })).rejects.toThrow(
      '"Valhalla Room" is installed as AU, not VST3. Only VST3 plug-ins can be hosted for now',
    );
  });

  it("suggests up to 5 installed VST3 names that contain the input", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "pro-q" })).rejects.toThrow(
      'No plug-in named "pro-q". Similar VST3 plug-ins: Pro-Q 4, Pro-Q 3',
    );
    await expect(resolvePlugin({ name: "r" })).rejects.toThrow(
      /Similar VST3 plug-ins: (?:[^,]+, ){4}[^,]+$/,
    );
  });

  it("gives no suggestions when nothing is similar", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "Nope" })).rejects.toThrow(
      /^No plug-in named "Nope"$/,
    );
  });

  it("does not offer disabled plug-ins", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "Old Verb" })).rejects.toThrow(
      /^No plug-in named "Old Verb"$/,
    );
  });

  it("names the vendors when several VST3 plug-ins share the name", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "Twin" })).rejects.toThrow(
      "(vendors: A Co, B Co)",
    );
  });

  it("refuses a plug-in whose kind Live doesn't say", async () => {
    useDb(goodDb);

    await expect(resolvePlugin({ name: "Mystery" })).rejects.toThrow(
      "instrument or an audio effect",
    );
  });

  it("requires a name", async () => {
    await expect(resolvePlugin({})).rejects.toThrow("name is required");
    await expect(resolvePlugin({ name: "  " })).rejects.toThrow(
      "name is required",
    );
  });

  it("reports a missing database", async () => {
    useDb(null);

    await expect(resolvePlugin({ name: "Serum 2" })).rejects.toThrow(
      "Can't read Live's plug-in database: Live plug-in database not found",
    );
  });

  it("reports a database without the expected tables instead of crashing", async () => {
    useDb(oldDb);

    await expect(resolvePlugin({ name: "Serum 2" })).rejects.toThrow(
      /^Can't read Live's plug-in database: .*plugin_modules/,
    );
  });
});
