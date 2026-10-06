# Up-front refusals, tool by tool

Where each tool applies the [refusal rules](README.md#refusals). This list
follows the code; when it disagrees with a tool, the tool wins.

- **Whole-call params are checked before any target is touched.** The send pair
  and `monitoringState` in `updateTrack`, the send pair in `updateDevice`, the
  tempo range in `updateScene`/`createScene`/`updateLiveSet`, `quantizePitch` in
  `updateClip`, `mappedPitch` in `updateDevice`, and the three malformed
  `params` entries in `updateDevice`/`createDevice`.
- **`updateTrack`, `updateScene` and `updateClip` refuse a call naming no
  target.** They warned and returned `[]`, which reads as "there was nothing to
  do" — every other tool already threw. They had applied their own warn-and-skip
  rule to a call with no items rather than to an item.
- **`updateLiveSet` refuses a call that sends no param at all**, with
  `nothing to update: send a param to change` (it has no `id` or `path` targets,
  so `refuseNoWrite` leaves that part out). It answered with the Set's id, which
  reads as if something had been written. A blank `scale` counts as sent, since
  an empty string disables the scale.
- **`updateTrack`, `updateScene`, `updateClip` and `updateDevice` refuse a call
  that asks nothing of their targets** (an `id` or `path` and no other param).
  Answering with the targets read as if something had been written. Any other
  param counts, `focus` included, and so does a take lane path that adds a lane
  (`t0/l+`). Switches set to false (`focus`, `wrapInRack`, `duplicateLoop`),
  `force`, which only unlocks another write, and a blank `toPath`, `toSlot`,
  `arrangementStart`, `arrangementLength`, `arrangementSplit` or `split` count
  for nothing. `refuseNoWrite` builds the message, so every update tool can
  share it:
  `nothing to update: id and path only name the scenes; also send a param to change`.
- **`updateTrack` and `updateScene` refuse a `path` entry they can't parse**
  before anything is written; an entry that parses but names no track or scene
  skips only its own target. `rt0/l0` is such an entry: only regular tracks have
  take lanes.
- **`updateClip` refuses a `path` entry it can't parse** before anything is
  written, and a `toPath` entry the same (`tX`); an entry that parses but names
  no clip skips only its own target, and a `toPath` entry that parses but names
  no place a clip can go (a scene) skips only its own move. One slot, or one
  track with a single position, can't cover several clips and is refused. One
  track or take lane takes several when `arrangementStart` names a position per
  clip.
- **`updateDevice` refuses a `path` entry it can't parse** before anything is
  written, with `wrapInRack` or without; an entry that parses but names no
  device skips only its own target (a wrap notes it on the rack's entry).
- **`duplicate` and `updateDevice` refuse a `toPath` entry they can't parse**
  before anything is copied or moved, for every kind of copy (clip, track onto a
  lane, scene, device, chain, drum pad). One that parses but can't be applied
  (no rack there, a move Live turned down) skips only its own destination.
- **`delete` refuses a `path` entry it can't parse** before anything is deleted,
  as well as a missing or unknown `type`, a call naming no target and a list
  with a hole. A path that parses but names the wrong kind of thing skips only
  its own target.
- **`createDevice` refuses a `path` entry it can't parse** before anything is
  made or loaded, as well as a list with a hole, lists of different lengths, a
  device name Live doesn't have, and a path list spelled through its own
  inserts. A path that parses but names no place (`t9/d+`, a scene) skips only
  its own target.
- **`createTrack` and `createScene` refuse a `path` entry they can't read**
  before anything is made, as well as a list with a hole, lists of different
  lengths, `count` with a path list, and a track or scene past the cap.
  `createScene` also refuses `count` with `capture` and a tempo out of range.
- **`createScene`, `updateScene`, `updateLiveSet`, `createClip` and `updateClip`
  refuse a `timeSignature`** that isn't `N/D` (or `disabled`, on scenes) or
  whose denominator isn't a power of two, since Live would change it. One check
  serves all five (`live-api-values.ts`).
- **A target named twice is refused**
  (`<param> names the <noun> on its own - don't send <params> with it`) by every
  tool that takes both params:
  - `readTrack`, `readScene`, `readClip`: `path` with `trackIndex` or
    `sceneIndex`, and `readClip`'s `slot` with them. This is in `readFanOut`,
    before any target is read, list or not.
  - `createTrack`, `createScene`: `path` with `trackIndex` or `sceneIndex`.
  - `createClip`: `path` with `trackIndex` or `sceneIndex`; `slot` with both (a
    `slot` list with a bare `trackIndex` is allowed); `takeLane` with a path
    that names a lane.
  - `duplicate` of a clip: `takeLane` with a `toPath` that names a lane, even
    one the copy can't reach. Other types refuse `takeLane` outright.
  - `select`: `path`, `slot` or `devicePath` with `trackIndex` or `sceneIndex`.
  - `playback`, for `play-scene`: `path` or `slots` with `sceneIndex`.
  - Every tool that reads an id or path list (the four reads, the update tools,
    `delete`, `duplicate`, `playback`): `id` with `ids` or its own id spelling,
    and `path` with `paths`, whatever the values. This is in
    `namedIdParam`/`namedPathParam`, before the targets are counted.
  - A param with its deprecated spelling, by `refuseDoubledSpelling` (`path` and
    `slot` in `readClip`/`createClip`, `toPath` and `toSlot` in `duplicate` and
    `updateClip`, `arrangementSplit` and `split`), and by hand in `select`
    (`path` with `slot` or `devicePath`; `slot` and `devicePath` without a path
    name a slot and a device, and select takes both), `playback` (`path` and
    `slots`; `startTime`, `loopStart`, `loopEnd` and their `*Locator`
    spellings), `duplicate` (`arrangementStart` and `locator`), `createDevice`
    (`device` and `deviceName`) and every tool with a position in a path
    coordinate (`refuseDoubledPosition`).

  Neither param is honored, so a warning would return a success-shaped result
  for a call that moved or split nothing. A param that names nothing (blank, or
  a coerced null) isn't sent. One helper words them all (`refuseNamedTwice`),
  and a test fails when a tool takes a pair of naming params and is not covered.

- **`updateClip` refuses a hole in `arrangementSplit` or `split`** (`2|1,,3|1`,
  `,`) before any clip is cut, worded as for any other list. A position at or
  before the clip's start is not a hole: it is dropped, and a list of only those
  is refused as having no valid point.
- **A list of locators reads `\,` as a comma in a name** wherever positions take
  `loc:` (`arrangementStart`, `arrangementSplit`, `duplicate`'s retired
  `locator`), and refuses a hole before any locator is looked up.
- **`updateClip` refuses `convert` beside a split** (`arrangementSplit` or
  `split`): the split makes several clips and nothing says which to convert. It
  refuses `convert` beside a move (`toPath`, `toSlot`, `arrangementStart`) too:
  the conversion adds a track that shifts the paths the move names.
- **`updateClip` refuses a `length` that spans nothing** (`0bar`, `n0/4`) before
  any clip is touched. One that is empty only in some meters (`1bar-n/1` in 4/4)
  skips that clip, as does a `start` at or past a looping clip's loop end sent
  without a `length`: Live would keep the old region.
- **`createClip` refuses a `path` entry it can't parse** before anything is
  made, as well as an arrangement position that won't parse or is past Live's
  last, a list that doesn't pair, and an unknown `auto`. A destination that
  parses but can't take its clip (no such track, the wrong kind of track, a take
  lane past the cap) skips only its own target.
- **Three tools can't check their raw args.** update-clip's `id` and `path` name
  different clips and add up, so its target count is their sum and the two are
  never compared to each other. duplicate shares its destinations out across the
  sources before pairing, so the counts that have to agree are the per-source
  ones — its check runs where the copies are planned, still before any is made.
  create-clip's `arrangementStart` pairs with the path's tracks, not its clip
  slots, and one track takes every position — so its per-clip lists are checked
  against the clips its destinations make, once those are resolved — still
  before any clip is made. A call making one clip still compares the raw args,
  since a count of 1 is never a list and a trailing comma must still count.

## A param the action doesn't read

The rule is in [Tool Behavior](README.md#a-param-only-another-action-reads). The
tables sit next to each tool's code and feed one helper,
`refuseParamsOutsideAction`.

- **`ppal-library`** (`library-action-params.ts`): `similarTo` is for
  `find-similar`; `category` for `list-categories`; `vendor`, `format` and
  `subcategory` for `list-plugins`; `sort`, `verifyPaths` and `searches` (and
  its old name `queries`) for `search`. `tags`, `type`, `source`, `inFolder` and
  a `kind` other than `audio` are for `search`, `find-similar` and
  `find-duplicates`; `query` and `deviceKind` also for `list-plugins`. `limit`
  is read by all. `deviceKind: "midifx"` on `list-plugins` is refused too.
- **`ppal-playback`** (`playback-action-params.ts`): `startTime`, `loop`,
  `loopStart`, `loopEnd` and the retired `*Locator` params are for
  `play-arrangement`, `update-arrangement` and `stop`. `id`, `path`, `slots` and
  the plurals are for `play-scene`, `play-session-clips` and
  `stop-session-clips`; `sceneIndex` for `play-scene` only.
- **`ppal-context`** (`context-action-params.ts`): `name` is for scope `memory`,
  `description` for a memory `write`, `content` for `write`, `force` for a
  project or global `write`. `delete` outside `memory` is refused as
  memory-only. The clobber guard throws.
- **`ppal-duplicate`** (`duplicate-input-validation.ts`), by `type`: `count` and
  `withoutClips` are for `track` and `scene`, `withoutDevices` and
  `routeToSource` for `track`, `transforms`, `code`, `toSlot` and `takeLane` for
  `clip`, `takeLaneName` for `clip` and `track`, `arrangementStart` and
  `locator` for `track`, `scene` and `clip`, `arrangementLength` for `clip` and
  `scene`. A track copied onto a take lane makes no track, so `count`,
  `withoutClips`, `withoutDevices` and `routeToSource` are refused for it as
  well (`destination "lane"`). `count` beside a list of scene positions or of
  take lanes is refused as create-track and create-scene refuse it, since the
  list already says how many. The destination decides the rest (a session clip
  copy has no length), so that stays a warning.
- **`ppal-update-live-set`** (`locator-updates.ts`): `locatorId` is for `delete`
  and `rename`; all three locator params need a `locatorOperation`.
- **`ppal-update-device`** (`rack-macro-updates.ts`): `macroVariationIndex` is
  for `load` and `delete`.
- **`ppal-update-clip`** (`update-clip-refusals.ts`, debug builds): the warp
  params belong to a `warpOp`: `warpSampleTime` to `add`, `warpDistance` to
  `move`, `warpBeatTime` to any.
- **`ppal-live-api`** (`live-api-operation-validation.ts`): per operation,
  `property`, `method`, `args` and `value` are for the types that read them; the
  message names `operations[N]`.
- **`ppal-library`** also refuses top-level search filters beside `searches`.
- **Not covered:** `ppal-create-track` (nothing depends on `type`; `arm` on a
  return track is per target), and `ppal-update-device`'s `wrapInRack`, which
  already refuses what it ignores in its own words.

## A value that can't be read, before the first write

- **`ppal-playback` reads its timeline before any action runs**, for every
  action that takes one (`play-arrangement`, `update-arrangement`, `stop`):
  `startTime`, `loopStart` and `loopEnd`, `loc:` names included, are parsed and
  resolved first. A malformed or unresolvable one refuses the call with the
  transport and the Set untouched. `stop` still writes the start position after
  it stops, because Live's second stop moves it; only the reading moved up.
- **`ppal-playback` `play-scene` with an id that names no scene** throws that
  id's own reason (`id "999" does not exist`, or the id is in no scene), not "a
  scene id is required", and warns nothing. When another param still names the
  scene, a bad id is warned and the scene plays.
- **`ppal-select` refuses a `devicePath` naming something that isn't a device**
  (a chain) before it changes the view or the selection.
