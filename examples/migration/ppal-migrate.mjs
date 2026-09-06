#!/usr/bin/env node

// Producer Pal migration adapter (Node 18+, no dependencies).
//
// Rewrites pre-2.4 tool arguments onto the `path` grammar that replaced them.
// The old params still work in 2.3 — they warn — and are removed in 2.4. Run
// your existing args through migrateArgs() and send back what it returns.
//
// CLI:
//   node ppal-migrate.mjs <tool-name> '<json-args>'
//   node ppal-migrate.mjs --self-test
//
// Library:
//   import { migrateArgs, buildPath, parsePath } from "./ppal-migrate.mjs";
//   const { args, notes } = migrateArgs("ppal-read-track", { trackIndex: 2 });
//   // args -> { path: "t2" }
//
// Three retirements are deliberately NOT rewritten, because a correct answer
// needs a Live read or a judgement call. Each is reported in `notes` instead,
// so a call is never left half-migrated:
//
//   ppal-update-clip `split`
//     Its positions are offsets from the clip's own start; `arrangementSplit`
//     reads the song timeline. The same value cuts somewhere else — converting
//     needs each clip's arrangement start, which means reading the clip first.
//
//   `params[].name` prefixes on ppal-create-device / ppal-update-device
//     {name: "pC1/c0/d0/Volume"} becomes path "t5/d0/pC1/c0/d0" with name
//     "Volume". `params` applies to every path in a call, so values that differ
//     per target turn one call into one call per target.
//
//   ppal-library `action: "searchBatch"`
//     Becomes `action: "search"` with a `searches` list: a different request
//     shape, not a path translation.

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Builds a path from its parts. Every field is optional; whichever are present
 * are assembled in grammar order — track, then scene or take lane, then the
 * device tail, then a bracketed song position.
 *
 * `trackIndex`, `sceneIndex` and `takeLane` take a number or the string "new"
 * for the `+` spelling that names a place which doesn't exist yet.
 */
export function buildPath(parts = {}) {
  const { trackIndex, trackType, sceneIndex, takeLane, deviceTail, position } =
    parts;
  const segments = [];
  const track = trackSegment(trackIndex, trackType);

  if (track) segments.push(track);
  if (sceneIndex != null) segments.push(`s${indexSpelling(sceneIndex)}`);
  if (takeLane != null) segments.push(`l${indexSpelling(takeLane)}`);
  if (deviceTail?.length) segments.push(...deviceTail);

  const body = segments.join("/");

  return position == null ? body : `${body}[${position}]`;
}

/**
 * Splits a path back into the parts buildPath() assembles, so a caller can
 * inspect or edit one piece without string surgery. Unrecognized segments
 * (devices, chains, drum pads) are kept in order as `deviceTail`.
 */
export function parsePath(path) {
  const text = String(path).trim();
  const coord = /\[([^\]]*)\]$/.exec(text);
  const parts = {};

  if (coord) parts.position = coord[1];

  const body = coord ? text.slice(0, coord.index) : text;
  const deviceTail = [];

  for (const segment of body.split("/").filter(Boolean)) {
    const match = /^(mt|rt|t|s|l)(\d+|\+)?$/.exec(segment);

    if (!match) {
      deviceTail.push(segment);
      continue;
    }

    const [, kind, value] = match;

    if (kind === "mt") parts.trackType = "main";
    else if (kind === "rt") assignTrack(parts, "return", value);
    else if (kind === "t") assignTrack(parts, "regular", value);
    else if (kind === "s") parts.sceneIndex = indexValue(value);
    else parts.takeLane = indexValue(value);
  }

  if (deviceTail.length > 0) parts.deviceTail = deviceTail;

  return parts;
}

/** The track segment: "mt", "rt0", "t0", or "" when no track is named. */
function trackSegment(trackIndex, trackType) {
  if (trackType === "main" || trackType === "master") return "mt";
  if (trackIndex == null) return "";

  // create-track spelled "append" as trackIndex -1; the path spelling is "t+".
  const index = trackIndex === -1 ? "new" : trackIndex;

  return `${trackType === "return" ? "rt" : "t"}${indexSpelling(index)}`;
}

/** "new" is the `+` spelling; anything else is a plain 0-based number. */
function indexSpelling(index) {
  return index === "new" ? "+" : String(index);
}

/** The inverse: `+` reads back as "new". */
function indexValue(value) {
  return value === "+" ? "new" : Number(value);
}

function assignTrack(parts, trackType, value) {
  parts.trackType = trackType;
  parts.trackIndex = indexValue(value);
}

// ---------------------------------------------------------------------------
// Argument migration
// ---------------------------------------------------------------------------

/**
 * Rewrites one tool call's arguments. Returns the new args plus `notes`:
 * anything the adapter could not translate on its own, in the words you'd want
 * in a code review. An empty `notes` means the call migrated cleanly.
 */
export function migrateArgs(toolName, args = {}) {
  const out = { ...args };
  const notes = [];

  MIGRATIONS[toolName]?.(out, notes);
  addParamsPrefixNotes(out, notes);

  return { args: out, notes };
}

const MIGRATIONS = {
  "ppal-read-track": (args) => migrateTrackTarget(args, "path"),
  "ppal-create-track": (args) => migrateTrackTarget(args, "path"),
  "ppal-update-track": migrateRoutingIds,
  "ppal-read-scene": (args) => migrateSceneTarget(args, "path"),
  "ppal-create-scene": (args) => migrateSceneTarget(args, "path"),
  "ppal-read-clip": (args) => migrateSlot(args, "slot", "path"),
  "ppal-create-clip": migrateCreateClip,
  "ppal-update-clip": migrateUpdateClip,
  "ppal-duplicate": migrateDuplicate,
  "ppal-select": migrateSelect,
  "ppal-playback": migratePlayback,
  "ppal-library": migrateLibrary,
};

/** trackIndex + trackType -> a track path. -1 meant append, so "t+". */
function migrateTrackTarget(args, key) {
  if (args.trackIndex == null && args.trackType == null) return;

  set(args, key, buildPath(takeTrack(args)));
}

function migrateSceneTarget(args, key) {
  if (args.sceneIndex == null) return;

  set(args, key, buildPath({ sceneIndex: take(args, "sceneIndex") }));
}

/** The four routing params that grew an `Id` suffix. Value untouched: the
 * surviving param already accepts a name or an id. */
function migrateRoutingIds(args) {
  for (const name of [
    "inputRoutingType",
    "inputRoutingChannel",
    "outputRoutingType",
    "outputRoutingChannel",
  ]) {
    if (args[`${name}Id`] != null) set(args, name, take(args, `${name}Id`));
  }
}

/** "0/3" -> "t0/s3", comma-separated lists included. */
function migrateSlot(args, from, to) {
  if (args[from] == null) return;

  const paths = splitList(take(args, from)).map((slot) => {
    const [trackIndex, sceneIndex] = slot.split("/");

    return buildPath({
      trackIndex: Number(trackIndex),
      sceneIndex: Number(sceneIndex),
    });
  });

  set(args, to, paths.join(","));
}

function migrateCreateClip(args) {
  migrateSlot(args, "slot", "path");

  if (args.arrangementStart != null) {
    // One destination track broadcasts across every position, which is how the
    // old params paired: trackIndex was a single value, arrangementStart a list.
    const track = takeTrack(args);
    const lane = laneIndex(take(args, "takeLane"));

    set(args, "path", positionPaths(args, "arrangementStart", track, lane));

    return;
  }

  if (args.trackIndex != null || args.sceneIndex != null) {
    set(args, "path", buildPath({ ...takeTrack(args), ...takeScene(args) }));
  }
}

function migrateUpdateClip(args, notes) {
  migrateSlot(args, "toSlot", "toPath");

  // No destination-track param existed here: the clip stayed on its own track,
  // which a path spells as a bare coordinate.
  if (args.arrangementStart != null) {
    set(args, "toPath", positionPaths(args, "arrangementStart", {}, null));
  }

  if (args.split != null) {
    notes.push(
      `split ${JSON.stringify(args.split)} left as-is: its positions are ` +
        "offsets from each clip's start, and arrangementSplit reads the song " +
        "timeline. Read each clip's start position and add it before you " +
        "rename the param.",
    );
  }
}

function migrateLibrary(args, notes) {
  if (args.action !== "searchBatch") return;

  notes.push(
    'action "searchBatch" left as-is: it becomes action "search" with a ' +
      "`searches` list, which is a different request shape.",
  );
}

function migrateDuplicate(args, notes) {
  migrateSlot(args, "toSlot", "toPath");

  if (args.locator != null) {
    args.arrangementStart = splitList(take(args, "locator"))
      .map((name) => `loc:${name}`)
      .join(",");
  }

  if (args.arrangementStart == null) return;

  // `arrangementStart` alone kept the copy on its source's track, which a path
  // spells as a bare "[5|1]". A take lane can't be spelled that way — Live
  // refuses "l0[5|1]" — so with a lane the destination has to name the track,
  // and the only place to read it from is the source path.
  const lane = args.takeLane == null ? null : laneIndex(args.takeLane);
  const track = lane == null ? {} : sourceTrack(args);

  if (track == null) {
    notes.push(
      "takeLane and arrangementStart left as-is: a take lane in a path needs " +
        'its track ("t1/l0[5|1]"), and the source track could not be read ' +
        "from `path` (absent, or several tracks). Name the destination track " +
        "yourself.",
    );

    return;
  }

  delete args.takeLane;
  set(args, "toPath", positionPaths(args, "arrangementStart", track, lane));
}

/**
 * The one track every source path names, as buildPath parts, or null when the
 * sources are addressed by id or span more than one track.
 */
function sourceTrack(args) {
  const entries = args.path == null ? [] : splitList(args.path);
  const tracks = new Set(
    entries.map((entry) => {
      const { trackIndex, trackType } = parsePath(entry);

      return buildPath({ trackIndex, trackType });
    }),
  );

  if (tracks.size !== 1) return null;

  const [only] = tracks;

  return only === "" ? null : parsePath(only);
}

function migrateSelect(args) {
  migrateSlot(args, "slot", "path");
  migrateTrackTarget(args, "path");
  migrateSceneTarget(args, "path");

  if (args.devicePath != null) set(args, "path", take(args, "devicePath"));
}

function migratePlayback(args) {
  migrateSlot(args, "slots", "path");
  migrateSceneTarget(args, "path");

  for (const [from, to] of [
    ["startLocator", "startTime"],
    ["loopStartLocator", "loopStart"],
    ["loopEndLocator", "loopEnd"],
  ]) {
    if (args[from] != null) set(args, to, `loc:${take(args, from)}`);
  }
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Fuses a list of song positions onto a destination, one path per position. */
function positionPaths(args, key, track, takeLaneIndex) {
  return splitList(take(args, key))
    .map((position) =>
      buildPath({ ...track, takeLane: takeLaneIndex, position }),
    )
    .join(",");
}

function takeTrack(args) {
  const trackIndex = take(args, "trackIndex");
  const trackType = take(args, "trackType");

  if (trackIndex == null && trackType == null) return {};

  // trackType "master" named the main track on its own, with no index.
  return {
    trackType: trackType === "master" ? "main" : (trackType ?? "regular"),
    ...(trackType === "master" ? {} : { trackIndex: trackIndex ?? 0 }),
  };
}

function takeScene(args) {
  const sceneIndex = take(args, "sceneIndex");

  return sceneIndex == null ? {} : { sceneIndex };
}

/**
 * takeLane counted from 1 and the `l<n>` path segment counts from 0, so this is
 * off by one everywhere — and takeLane 0 named the main lane, which is no take
 * lane at all rather than lane 0. Returns null for anything that names no lane.
 */
function laneIndex(value) {
  if (value == null || value === "") return null;
  if (String(value).toLowerCase() === "new") return "new";

  const lane = Number(value);

  if (!Number.isInteger(lane) || lane < 1) return null;

  return lane - 1;
}

/**
 * Flags a param name that may carry a device path prefix. Not tied to a tool:
 * only the device tools take `params`, and both of them changed the same way.
 */
function addParamsPrefixNotes(args, notes) {
  for (const param of args.params ?? []) {
    if (typeof param?.name === "string" && param.name.includes("/")) {
      notes.push(
        `params name ${JSON.stringify(param.name)} may carry a device path ` +
          "prefix, which moves into `path`. Params apply to every path in a " +
          "call, so per-target values need one call each. (A real param name " +
          'containing a slash, like "Dry/Wet", needs no change.)',
      );
    }
  }
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String);

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Reads a param and removes it, so the old spelling never ships. */
function take(args, key) {
  const value = args[key];

  delete args[key];

  return value ?? null;
}

/** Writes the replacement, leaving an explicit value the caller already set. */
function set(args, key, value) {
  args[key] ??= value;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// Every row was run against Live 12.4 on 2.3: `before` and `after` produce the
// same result, and `before` also emits the deprecation warning it migrates off.
const CASES = [
  ["ppal-read-track", { trackIndex: 2 }, { path: "t2" }],
  ["ppal-read-track", { trackIndex: 0, trackType: "return" }, { path: "rt0" }],
  ["ppal-select", { trackType: "master" }, { path: "mt" }],
  ["ppal-create-track", { trackIndex: -1 }, { path: "t+" }],
  [
    "ppal-update-track",
    { outputRoutingTypeId: "2" },
    { outputRoutingType: "2" },
  ],
  ["ppal-read-scene", { sceneIndex: 2 }, { path: "s2" }],
  ["ppal-read-clip", { slot: "1/0" }, { path: "t1/s0" }],
  ["ppal-select", { devicePath: "t6/d0" }, { path: "t6/d0" }],
  [
    "ppal-playback",
    { action: "play-session-clips", slots: "0/0,1/0" },
    { action: "play-session-clips", path: "t0/s0,t1/s0" },
  ],
  [
    "ppal-playback",
    { action: "play-arrangement", startLocator: "Chorus" },
    { action: "play-arrangement", startTime: "loc:Chorus" },
  ],
  [
    "ppal-create-clip",
    { trackIndex: 1, arrangementStart: "33|1,37|1" },
    { path: "t1[33|1],t1[37|1]" },
  ],
  [
    "ppal-create-clip",
    { trackIndex: 1, arrangementStart: "21|1", takeLane: "new" },
    { path: "t1/l+[21|1]" },
  ],
  [
    "ppal-duplicate",
    { type: "clip", path: "t1/s0", takeLane: "1", arrangementStart: "17|1" },
    { type: "clip", path: "t1/s0", toPath: "t1/l0[17|1]" },
  ],
  [
    "ppal-duplicate",
    { type: "clip", path: "t1/s0", locator: "Chorus" },
    { type: "clip", path: "t1/s0", toPath: "[loc:Chorus]" },
  ],
  [
    "ppal-update-clip",
    { path: "t1[41|1],t1[45|1]", arrangementStart: "49|1,53|1" },
    { path: "t1[41|1],t1[45|1]", toPath: "[49|1],[53|1]" },
  ],
  [
    "ppal-update-clip",
    { path: "t1/s0", toSlot: "2/5" },
    { path: "t1/s0", toPath: "t2/s5" },
  ],
];

function selfTest() {
  let failed = 0;

  for (const [tool, before, expected] of CASES) {
    const { args } = migrateArgs(tool, before);
    const got = JSON.stringify(args);
    const want = JSON.stringify(expected);

    if (got !== want) {
      failed += 1;
      console.error(`FAIL ${tool} ${JSON.stringify(before)}`);
      console.error(`  want ${want}`);
      console.error(`  got  ${got}`);
    }
  }

  // A path survives a round trip through its parts, which is the property the
  // adapter leans on everywhere it edits one piece of a path.
  for (const path of ["t0", "rt1", "mt", "t+", "t0/s3", "t1/l0[17|1]"]) {
    const round = buildPath(parsePath(path));

    if (round !== path) {
      failed += 1;
      console.error(`FAIL round trip ${path} -> ${round}`);
    }
  }

  console.log(
    failed === 0
      ? `${CASES.length} cases + round trips OK`
      : `${failed} failure(s)`,
  );

  return failed === 0 ? 0 : 1;
}

function main(argv) {
  if (argv[0] === "--self-test") return selfTest();

  const [toolName, json] = argv;

  if (!toolName) {
    console.error("usage: ppal-migrate.mjs <tool-name> '<json-args>'");
    console.error("       ppal-migrate.mjs --self-test");

    return 1;
  }

  const { args, notes } = migrateArgs(toolName, JSON.parse(json ?? "{}"));

  console.log(JSON.stringify(args, null, 2));

  for (const note of notes) console.error(`note: ${note}`);

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
