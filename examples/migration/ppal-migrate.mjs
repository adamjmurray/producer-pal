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
// Some retirements are deliberately NOT rewritten, because a correct answer
// needs a Live read or a judgement call. Each is reported in `notes` instead,
// and the params it names are left as they were, so a call is never left
// half-migrated:
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
//
//   A destination two params name and one path can't
//     ppal-select's trackIndex + sceneIndex on a return or the main track (no
//     clip slot to hold both), ppal-duplicate's takeLane when the source track
//     can't be read off `path`, and any value the tool itself refuses.

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Builds a path from its parts. Every field is optional; whichever are present
 * are assembled in grammar order — track, then scene or take lane, then the
 * device tail, then a bracketed song position.
 *
 * `trackIndex`, `sceneIndex` and `takeLane` take a number or the string "new"
 * for the `+` spelling that names a place which doesn't exist yet. `takeLane`
 * also takes "same" for `l=`, the lane the `l+` before it appended.
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
    const match = /^(mt|rt|t|s|l)(\d+|\+|=)?$/.exec(segment);

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

/** "new" is `+` and "same" is `=`; anything else is a plain 0-based number. */
function indexSpelling(index) {
  if (index === "new") return "+";
  if (index === "same") return "=";

  return String(index);
}

/** The inverse: `+` reads back as "new", `=` as "same". */
function indexValue(value) {
  if (value === "+") return "new";
  if (value === "=") return "same";

  return Number(value);
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
  "ppal-create-track": migrateCreateTrack,
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
  // trackType alone names a track only for the main track, which has no index.
  // "return" or "regular" without one named nothing then either, so leave the
  // call as it stands rather than inventing index 0.
  if (args.trackIndex == null && !namesMainTrack(args.trackType)) return;

  set(args, key, buildPath(takeTrack(args)));
}

/**
 * create-track spells a return track as `type: "return"`, not trackType, and
 * the path settles both the type and the position — Live appends return tracks,
 * so trackIndex never applied to one.
 */
function migrateCreateTrack(args) {
  // A caller already using `path` is naming the destination twice; the tool has
  // its own answer for that, and dropping either side would hide it.
  if (args.type === "return" && args.path == null) {
    delete args.type;
    delete args.trackIndex;
    args.path = "rt+";

    return;
  }

  migrateTrackTarget(args, "path");
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
  const paths = slotPaths(args, from);

  if (paths.length > 0) set(args, to, paths.join(","));
}

/** The slot list as one path each, and the param gone. */
function slotPaths(args, key) {
  if (args[key] == null) return [];

  return splitList(take(args, key)).map((slot) => {
    const [trackIndex, sceneIndex] = slot.split("/");

    return buildPath({
      trackIndex: Number(trackIndex),
      sceneIndex: Number(sceneIndex),
    });
  });
}

function migrateCreateClip(args, notes) {
  // A slot list and a trackIndex compose: the first names session destinations,
  // the second an arrangement one, and a call sending both makes both clips. So
  // they join into one path list rather than one overwriting the other.
  const paths = slotPaths(args, "slot");

  if (args.trackIndex != null && args.sceneIndex != null) {
    paths.push(buildPath({ ...takeTrack(args), ...takeScene(args) }));
  } else if (args.arrangementStart != null) {
    // One destination track broadcasts across every position, which is how the
    // old params paired: trackIndex was a single value, arrangementStart a list.
    const track = takeTrack(args);
    const lane = takeLaneTarget(args, notes);

    paths.push(...positionPaths(args, "arrangementStart", track, lane));
  } else if (args.trackIndex != null) {
    paths.push(buildPath(takeTrack(args)));
  }

  if (paths.length > 0) set(args, "path", paths.join(","));

  if (args.arrangementStart != null) {
    notes.push(
      "arrangementStart left as-is: trackIndex and sceneIndex named a clip " +
        "slot, so no track is left for a position. Name the arrangement " +
        'track yourself, as "t<track>[<position>]".',
    );
  }
}

function migrateUpdateClip(args, notes) {
  migrateSlot(args, "toSlot", "toPath");

  // No destination-track param existed here: the clip stayed on its own track,
  // which a path spells as a bare coordinate.
  if (args.arrangementStart != null) {
    set(
      args,
      "toPath",
      positionPaths(args, "arrangementStart", {}, null).join(","),
    );
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
  const lane = laneIndex(args.takeLane);
  const track = lane == null ? {} : sourceTrack(args);

  if (lane === undefined) {
    notes.push(unusableLaneNote(args.takeLane));

    return;
  }

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
  set(
    args,
    "toPath",
    positionPaths(args, "arrangementStart", track, lane).join(","),
  );
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

function migrateSelect(args, notes) {
  migrateSlot(args, "slot", "path");

  // trackIndex and sceneIndex select both at once, which one path spells as a
  // clip slot — but only for a regular track. A return or the main track has no
  // clip slots, so that pair names two things no single path can.
  if (args.trackIndex != null && args.sceneIndex != null) {
    if (namesRegularTrack(args.trackType)) {
      set(args, "path", buildPath({ ...takeTrack(args), ...takeScene(args) }));
    } else {
      notes.push(
        `trackType ${JSON.stringify(args.trackType)} and sceneIndex left ` +
          "as-is: they select two things, and a return or the main track has " +
          "no clip slot to name both in one path. Select them in two calls.",
      );
    }
  } else {
    migrateTrackTarget(args, "path");
    migrateSceneTarget(args, "path");
  }

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
  return splitList(take(args, key)).map((position, index) =>
    buildPath({
      ...track,
      // One `takeLane: "new"` made one lane however many positions landed on
      // it. A repeated `l+` would append a lane each time, so every position
      // after the first reuses the first one's lane, which `l=` spells.
      takeLane: takeLaneIndex === "new" && index > 0 ? "same" : takeLaneIndex,
      position,
    }),
  );
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

/** Whether trackType named the main track, the one track with no index. */
function namesMainTrack(trackType) {
  return trackType === "master" || trackType === "main";
}

/** Whether trackType named a regular track — the only kind with clip slots. */
function namesRegularTrack(trackType) {
  return trackType == null || trackType === "regular";
}

function takeScene(args) {
  const sceneIndex = take(args, "sceneIndex");

  return sceneIndex == null ? {} : { sceneIndex };
}

/**
 * The take lane the call named, as a path target, with the param removed. A
 * value that names no lane the tool accepts keeps its param and gets a note
 * instead: the call fails either way, and quietly rewriting it as the main lane
 * would hide that.
 */
function takeLaneTarget(args, notes) {
  const lane = laneIndex(args.takeLane);

  if (lane === undefined) {
    notes.push(unusableLaneNote(args.takeLane));

    return null;
  }

  delete args.takeLane;

  return lane;
}

/** What to say about a takeLane value the tool would refuse. */
function unusableLaneNote(value) {
  return (
    `takeLane ${JSON.stringify(value)} left as-is: it names no lane. The ` +
    'param counts from 1 — 0 is the main lane, 1 is "l0", and "new" is "l+".'
  );
}

/**
 * takeLane counted from 1 and the `l<n>` path segment counts from 0, so this is
 * off by one everywhere — and takeLane 0 named the main lane, which is no take
 * lane at all rather than lane 0. Returns null where no lane was named, and
 * undefined for a value the tool refuses.
 */
function laneIndex(value) {
  if (value == null || value === "") return null;
  if (String(value) === "new") return "new";

  const lane = Number(value);

  if (!Number.isInteger(lane) || lane < 0) return undefined;

  return lane === 0 ? null : lane - 1;
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

// `before` and `after` name the same thing, and every row migrates cleanly —
// the self-test fails a row that comes back with a note.
// The tool names below, written once each.
const TOOL = {
  createClip: "ppal-create-clip",
  createTrack: "ppal-create-track",
  duplicate: "ppal-duplicate",
  library: "ppal-library",
  playback: "ppal-playback",
  readClip: "ppal-read-clip",
  readScene: "ppal-read-scene",
  readTrack: "ppal-read-track",
  select: "ppal-select",
  updateClip: "ppal-update-clip",
  updateDevice: "ppal-update-device",
  updateTrack: "ppal-update-track",
};

const CASES = [
  [TOOL.readTrack, { trackIndex: 2 }, { path: "t2" }],
  [TOOL.readTrack, { trackIndex: 0, trackType: "return" }, { path: "rt0" }],
  // A type with no index named nothing then either, so it is left to fail the
  // way it already did rather than being pointed at return track 0.
  [TOOL.readTrack, { trackType: "return" }, { trackType: "return" }],
  [TOOL.select, { trackType: "master" }, { path: "mt" }],
  // Both are selected, and one clip-slot path says so.
  [TOOL.select, { trackIndex: 1, sceneIndex: 3 }, { path: "t1/s3" }],
  [TOOL.createTrack, { trackIndex: -1 }, { path: "t+" }],
  // Live appends return tracks, so the path carries the type and the position.
  [TOOL.createTrack, { trackIndex: -1, type: "return" }, { path: "rt+" }],
  [TOOL.updateTrack, { outputRoutingTypeId: "2" }, { outputRoutingType: "2" }],
  [TOOL.readScene, { sceneIndex: 2 }, { path: "s2" }],
  [TOOL.readClip, { slot: "1/0" }, { path: "t1/s0" }],
  [TOOL.select, { devicePath: "t6/d0" }, { path: "t6/d0" }],
  [
    TOOL.playback,
    { action: "play-session-clips", slots: "0/0,1/0" },
    { action: "play-session-clips", path: "t0/s0,t1/s0" },
  ],
  [
    TOOL.playback,
    { action: "play-arrangement", startLocator: "Chorus" },
    { action: "play-arrangement", startTime: "loc:Chorus" },
  ],
  [
    TOOL.createClip,
    { trackIndex: 1, arrangementStart: "33|1,37|1" },
    { path: "t1[33|1],t1[37|1]" },
  ],
  // A slot list and a trackIndex named a session and an arrangement
  // destination in one call, and both clips still get made.
  [
    TOOL.createClip,
    { slot: "0/0", trackIndex: 1, arrangementStart: "5|1" },
    { path: "t0/s0,t1[5|1]" },
  ],
  // takeLane 0 was the main lane, which is no take lane at all.
  [
    TOOL.createClip,
    { trackIndex: 1, arrangementStart: "5|1", takeLane: 0 },
    { path: "t1[5|1]" },
  ],
  [
    TOOL.createClip,
    { trackIndex: 1, arrangementStart: "21|1", takeLane: "new" },
    { path: "t1/l+[21|1]" },
  ],
  // One takeLane made one lane however many positions landed on it, so only
  // the first position appends: "l=" reuses that lane.
  [
    TOOL.createClip,
    { trackIndex: 1, arrangementStart: "21|1,25|1", takeLane: "new" },
    { path: "t1/l+[21|1],t1/l=[25|1]" },
  ],
  [
    TOOL.duplicate,
    { type: "clip", path: "t1/s0", takeLane: "1", arrangementStart: "17|1" },
    { type: "clip", path: "t1/s0", toPath: "t1/l0[17|1]" },
  ],
  [
    TOOL.duplicate,
    {
      type: "clip",
      path: "t1/s0",
      takeLane: "new",
      arrangementStart: "17|1,21|1",
    },
    { type: "clip", path: "t1/s0", toPath: "t1/l+[17|1],t1/l=[21|1]" },
  ],
  [
    TOOL.duplicate,
    { type: "clip", path: "t1/s0", locator: "Chorus" },
    { type: "clip", path: "t1/s0", toPath: "[loc:Chorus]" },
  ],
  [
    TOOL.updateClip,
    { path: "t1[41|1],t1[45|1]", arrangementStart: "49|1,53|1" },
    { path: "t1[41|1],t1[45|1]", toPath: "[49|1],[53|1]" },
  ],
  [
    TOOL.updateClip,
    { path: "t1/s0", toSlot: "2/5" },
    { path: "t1/s0", toPath: "t2/s5" },
  ],
];

// The other half of the contract: what the adapter refuses to translate. Each
// row is the call, a word its note has to carry, and the params it must leave
// alone for the caller to deal with.
const NOTE_CASES = [
  [TOOL.updateClip, { path: "t1[9|1]", split: "2|1" }, "split", ["split"]],
  [TOOL.library, { action: "searchBatch" }, "searchBatch", ["action"]],
  [
    TOOL.createClip,
    { trackIndex: 1, arrangementStart: "5|1", takeLane: "later" },
    "takeLane",
    ["takeLane"],
  ],
  [
    TOOL.createClip,
    { trackIndex: 1, sceneIndex: 2, arrangementStart: "5|1" },
    "arrangementStart",
    ["arrangementStart"],
  ],
  [
    TOOL.select,
    { trackType: "return", trackIndex: 0, sceneIndex: 2 },
    "sceneIndex",
    ["trackType", "trackIndex", "sceneIndex"],
  ],
  [
    TOOL.duplicate,
    { type: "clip", id: "id 1", takeLane: "1", arrangementStart: "17|1" },
    "take lane",
    ["takeLane", "arrangementStart"],
  ],
  [
    TOOL.updateDevice,
    { path: "t5/d0", params: [{ name: "pC1/c0/d0/Volume", value: "-6" }] },
    "device path",
    ["params"],
  ],
];

function selfTest() {
  let failed = 0;

  for (const [tool, before, expected] of CASES) {
    const { args, notes } = migrateArgs(tool, before);
    const got = JSON.stringify(args);
    const want = JSON.stringify(expected);

    // A row here migrated cleanly, so a note on one means the adapter is no
    // longer sure of an answer it is still handing back.
    if (notes.length > 0) {
      failed += 1;
      console.error(`FAIL ${tool} ${JSON.stringify(before)}`);
      console.error(`  unexpected note: ${notes[0]}`);
    }

    if (got !== want) {
      failed += 1;
      console.error(`FAIL ${tool} ${JSON.stringify(before)}`);
      console.error(`  want ${want}`);
      console.error(`  got  ${got}`);
    }
  }

  for (const [tool, before, word, kept] of NOTE_CASES) {
    const asked = JSON.stringify(before);
    const { args, notes } = migrateArgs(tool, before);

    if (!notes.some((note) => note.includes(word))) {
      failed += 1;
      console.error(`FAIL ${tool} ${asked}`);
      console.error(`  want a note about "${word}", got ${notes.length}`);
    }

    // A note says the caller still has this one to handle, so the param it
    // names has to survive: rewriting half of it is worse than none.
    for (const param of kept.filter((name) => args[name] == null)) {
      failed += 1;
      console.error(`FAIL ${tool} ${asked}`);
      console.error(`  noted but dropped "${param}": ${JSON.stringify(args)}`);
    }
  }

  // A path survives a round trip through its parts, which is the property the
  // adapter leans on everywhere it edits one piece of a path.
  for (const path of [
    "t0",
    "rt1",
    "mt",
    "t+",
    "t0/s3",
    "t1/l0[17|1]",
    "t1/l=[21|1]",
  ]) {
    const round = buildPath(parsePath(path));

    if (round !== path) {
      failed += 1;
      console.error(`FAIL round trip ${path} -> ${round}`);
    }
  }

  console.log(
    failed === 0
      ? `${CASES.length + NOTE_CASES.length} cases + round trips OK`
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

  let parsed;

  try {
    parsed = JSON.parse(json ?? "{}");
  } catch (error) {
    console.error(`could not read the args as JSON: ${error.message}`);
    console.error("quote them as one argument, e.g. '{\"trackIndex\": 2}'");

    return 1;
  }

  const { args, notes } = migrateArgs(toolName, parsed);

  console.log(JSON.stringify(args, null, 2));

  for (const note of notes) console.error(`note: ${note}`);

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
