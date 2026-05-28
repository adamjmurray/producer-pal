// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared fixture for Live-library DB tests.
 *
 * Creates a SQLite file matching the parts of Live's `Live-files-*.db`
 * schema we actually query: files, places, keywords. Populated with a
 * small synthetic library covering pack/user/builtin sources, audio +
 * MIDI + plugin kinds, and tag attachments.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { fourCC } from "../../library-filters.ts";

export interface LibraryFixture {
  dir: string;
  dbPath: string;
  cleanup: () => void;
}

/**
 * Create a temp DB pre-populated with a synthetic Live library.
 *
 * @returns Fixture handle with the DB path and a cleanup function.
 */
export function createLibraryFixture(): LibraryFixture {
  const dir = mkdtempSync(join(tmpdir(), "ppal-lib-fixture-"));
  const dbPath = join(dir, "Live-files-12300.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE files (
      file_id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      file_type INTEGER,
      file_kind INTEGER,
      name TEXT,
      use_count INTEGER DEFAULT 0,
      mod_date INTEGER DEFAULT 0,
      device_type INTEGER DEFAULT 0,
      place_id INTEGER,
      subtype INTEGER
    );
    CREATE TABLE places (
      file_id INTEGER PRIMARY KEY,
      folder_kind INTEGER,
      level INTEGER DEFAULT 0,
      name TEXT
    );
    CREATE TABLE keywords (
      file_id INTEGER,
      keyw_id INTEGER,
      is_auto INTEGER DEFAULT 0
    );
    CREATE TABLE metadata (
      file_id INTEGER,
      key INTEGER,
      value_id INTEGER
    );
    CREATE TABLE metadata_values (
      id INTEGER PRIMARY KEY,
      value TEXT
    );
  `);

  insertFiles(db);
  insertPlaces(db);
  insertKeywords(db);
  insertMetadata(db);

  db.close();

  return {
    dir,
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Wire up beforeAll/beforeEach/afterEach/afterAll hooks for a Live-library DB test:
 * creates the fixture, mocks `findLiveFilesDbPath` to return its path, and cleans up.
 *
 * @param dbPathMod - The mocked `live-db-path` module
 * @param dbPathMod.findLiveFilesDbPath - The mocked finder function whose mock is rebound each test
 */
export function setupLibraryFixtureLifecycle(dbPathMod: {
  findLiveFilesDbPath: (...args: unknown[]) => unknown;
}): void {
  let fixture: LibraryFixture;

  beforeAll(() => {
    fixture = createLibraryFixture();
  });

  beforeEach(() => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(fixture.dbPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    fixture.cleanup();
  });
}

const FLDR = fourCC("fldr");
const AIFF = fourCC("aiff");
const WAV = fourCC("wav-");
const MIDI = fourCC("midi");
const ALC = fourCC("alc-");
const ADG = fourCC("adg-");
const AMP = fourCC("amp-");
const ALS = fourCC("als-");
const VST3 = fourCC("vst3");
const KEYW = fourCC("keyw");
// metadata.key fourCCs carrying `Category|Sub|Leaf` tag-path strings
const META_CKEY = fourCC("CKey");
const META_KEYW = fourCC("Keyw");

/**
 * Insert the synthetic file rows into the fixture DB.
 *
 * Folder chain: / -> Users -> test -> Music -> Ableton -> User Library  (place 100, user)
 *                                          -> Factory Packs -> Pack One (place 200, pack)
 *                                          -> Built-in                  (place 300, builtin)
 *
 * Sample files attached to each place with various kinds, tags, and use_counts.
 *
 * @param db - Open writable DB
 */
function insertFiles(db: DatabaseSync): void {
  const insert = db.prepare(
    `INSERT INTO files
     (file_id, parent_id, file_type, file_kind, name, use_count, mod_date, device_type, place_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // Folder chain to root
  insert.run(1, 0, FLDR, 512, "/", 0, 0, 0, null);
  insert.run(2, 1, FLDR, 512, "Users", 0, 0, 0, null);
  insert.run(3, 2, FLDR, 512, "test", 0, 0, 0, null);
  insert.run(4, 3, FLDR, 512, "Music", 0, 0, 0, null);
  insert.run(5, 4, FLDR, 512, "Ableton", 0, 0, 0, null);
  insert.run(100, 5, FLDR, 512, "User Library", 0, 0, 0, null);
  insert.run(6, 5, FLDR, 512, "Factory Packs", 0, 0, 0, null);
  insert.run(200, 6, FLDR, 512, "Pack One", 0, 0, 0, null);
  insert.run(300, 5, FLDR, 512, "Built-in", 0, 0, 0, null);

  // User Library audio
  insert.run(1001, 100, AIFF, 4, "user_kick.aif", 50, 1_700_000_000, 0, 100);
  insert.run(1002, 100, WAV, 4, "user_snare.wav", 25, 1_700_000_100, 0, 100);

  // Pack audio
  insert.run(2001, 200, WAV, 4, "pack_kick.wav", 100, 1_700_000_200, 0, 200);
  insert.run(2002, 200, AIFF, 4, "pack_clap.aif", 5, 1_700_000_300, 0, 200);

  // Pack midi clip
  insert.run(2003, 200, MIDI, 1, "pack_riff.mid", 30, 1_700_000_400, 0, 200);

  // Pack Live clips (.alc): one MIDI (alcM), one audio (alcA). The audio clip
  // has place_id=null so it only surfaces in kind:live-clip (keeps source-filter
  // tests stable). Subtypes set below via UPDATE. See AJM-335.
  insert.run(2004, 200, ALC, 2, "pack_loop.alc", 12, 1_700_000_450, 0, 200);
  insert.run(2007, 200, ALC, 2, "pack_audio.alc", 6, 1_700_000_455, 0, null);

  // Pack Ableton device group (.adg) — kind=device-group
  insert.run(2005, 200, ADG, 32, "pack_chain.adg", 8, 1_700_000_460, 0, 200);

  // Pack Max for Live device (.amxd) — kind=m4l-device
  insert.run(2006, 200, AMP, 16, "pack_m4l.amxd", 4, 1_700_000_470, 0, 200);

  // Built-in plugin (instrument)
  insert.run(
    3001,
    300,
    VST3,
    16_384,
    "Operator.vst3",
    75,
    1_700_000_500,
    1,
    300,
  );

  // Built-in plugin (audiofx)
  insert.run(
    3002,
    300,
    VST3,
    16_384,
    "EQ Eight.vst3",
    200,
    1_700_000_600,
    2,
    300,
  );

  // Live sets (.als) under root Ableton folder, no place_id → null source.
  // All have use_count=0 with distinct mod_date values for tiebreaker tests.
  insert.run(4001, 5, ALS, 8, "set_oldest.als", 0, 1_700_000_700, 0, null);
  insert.run(4002, 5, ALS, 8, "set_newest.als", 0, 1_700_000_900, 0, null);
  insert.run(4003, 5, ALS, 8, "set_middle.als", 0, 1_700_000_800, 0, null);

  // Subfolder hierarchy for inFolder tests:
  //   /Users/test/Music/Ableton/Pack One/SubA/  (file_id 210)
  //   /Users/test/Music/Ableton/Pack One/SubA/subfolder_x.wav  (file_id 211)
  //   /Users/test/Music/Ableton/Pack One/SubA/subfolder_y.wav  (file_id 212, tagged SubOnly)
  //   /Users/test/Music/Ableton/Pack One/SubB/   (file_id 220)
  //   /Users/test/Music/Ableton/Pack One/SubB/subfolder_z.wav  (file_id 221)
  // Use names that do NOT contain "kick"/"snare"/etc. to avoid collisions
  // with existing query/tags tests. SubOnly tag is unique to the fixture.
  insert.run(210, 200, FLDR, 512, "SubA", 0, 0, 0, null);
  insert.run(211, 210, WAV, 4, "subfolder_x.wav", 3, 1_700_001_000, 0, 200);
  insert.run(212, 210, WAV, 4, "subfolder_y.wav", 1, 1_700_001_100, 0, 200);
  insert.run(220, 200, FLDR, 512, "SubB", 0, 0, 0, null);
  insert.run(221, 220, WAV, 4, "subfolder_z.wav", 2, 1_700_001_200, 0, 200);

  // Keyword definitions (file_type='keyw')
  insert.run(9001, 1, KEYW, 0, "Kick", 0, 0, 0, null);
  insert.run(9002, 1, KEYW, 0, "Punchy", 0, 0, 0, null);
  insert.run(9003, 1, KEYW, 0, "Snare Hit", 0, 0, 0, null);
  insert.run(9004, 1, KEYW, 0, "One Shot", 0, 0, 0, null);
  // SubOnly tag: attached to subfolder_y.wav only, used in inFolder+tags test
  insert.run(9005, 1, KEYW, 0, "SubOnly", 0, 0, 0, null);

  // Live-clip subtypes: pack_loop.alc is MIDI (alcM), pack_audio.alc is audio
  // (alcA). Set separately so the shared INSERT column list stays unchanged.
  const setSubtype = db.prepare(
    "UPDATE files SET subtype = ? WHERE file_id = ?",
  );

  setSubtype.run(fourCC("alcM"), 2004);
  setSubtype.run(fourCC("alcA"), 2007);
}

/**
 * Insert the place rows declaring which folders are roots.
 *
 * @param db - Open writable DB
 */
function insertPlaces(db: DatabaseSync): void {
  const insert = db.prepare(
    "INSERT INTO places (file_id, folder_kind, name) VALUES (?, ?, ?)",
  );

  insert.run(100, 1, "User Library");
  insert.run(200, 0, "Pack One");
  insert.run(300, 8, "Built-in");
}

/**
 * Attach tags to sample files via the keywords table.
 *
 * @param db - Open writable DB
 */
function insertKeywords(db: DatabaseSync): void {
  const insert = db.prepare(
    "INSERT INTO keywords (file_id, keyw_id, is_auto) VALUES (?, ?, ?)",
  );

  // user_kick.aif -> Kick + One Shot
  insert.run(1001, 9001, 0);
  insert.run(1001, 9004, 0);
  // user_snare.wav -> Snare Hit
  insert.run(1002, 9003, 0);
  // pack_kick.wav -> Kick + Punchy + One Shot
  insert.run(2001, 9001, 0);
  insert.run(2001, 9002, 0);
  insert.run(2001, 9004, 1);
  // pack_clap.aif -> One Shot
  insert.run(2002, 9004, 0);
  // pack_riff.mid -> (no tags)
  // Built-in plugins: no tags
  // subfolder_y.wav (212) -> SubOnly (for inFolder + tags composition test)
  insert.run(212, 9005, 0);
}

/**
 * Populate the metadata tables with a small `Category|Sub|Leaf` taxonomy for
 * listCategories tests. Leaf segments deliberately reuse existing keyword names
 * (Kick, Snare Hit, One Shot) so drill-down file counts resolve via the
 * keywords table; "Synth Bass" has no keyword (counts to nothing) and a bare
 * "Core Library" value (no pipe) must be excluded from the taxonomy.
 *
 * @param db - Open writable DB
 */
function insertMetadata(db: DatabaseSync): void {
  const value = db.prepare(
    "INSERT INTO metadata_values (id, value) VALUES (?, ?)",
  );

  value.run(1, "Drums|Kick");
  value.run(2, "Drums|Snare|Snare Hit");
  value.run(3, "Type|One Shot");
  value.run(4, "Core Library");
  value.run(5, "Sounds|Bass|Synth Bass");

  const meta = db.prepare(
    "INSERT INTO metadata (file_id, key, value_id) VALUES (?, ?, ?)",
  );

  meta.run(2001, META_CKEY, 1); // Drums|Kick
  meta.run(1001, META_CKEY, 1); // Drums|Kick (second file, same value)
  meta.run(1002, META_KEYW, 2); // Drums|Snare|Snare Hit
  meta.run(2001, META_CKEY, 3); // Type|One Shot
  meta.run(2001, META_CKEY, 4); // Core Library (no pipe → excluded)
  meta.run(1001, META_CKEY, 5); // Sounds|Bass|Synth Bass (leaf has no keyword)
}
