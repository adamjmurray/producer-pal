# Refusals

Part of [Tool Behavior](README.md).

A call is refused up front, having changed nothing, when it is malformed or
can't be carried out as asked. The test is whether the Live Set is unchanged,
not when the tool found out. A refused call costs the caller one retry.

How the tool answers depends on what is wrong:

- **Structure, before any work runs → throw.** A hole in a list, an arg that
  names nothing, lists that can't be paired, a call naming no target, an entry
  that can't be parsed, an update call that names targets and sends no param to
  write (every update tool uses `refuseNoWrite`, so they all word it the same).
  A call naming no target says `id or path is required` and teaches the address:
  an example path for what the tool takes (`delete` and `duplicate` by their
  `type`) and the read that lists real ones. The words are `idOrPathRequired`'s.
  It never falls back to a default target.
- **A whole-call param the tool can't read → throw**, in update tools too: a
  half of the deprecated `sendGainDb`/`sendReturn` pair, a tempo outside Live's
  range, a note name that parses as nothing, a `params` entry with no name or
  value. Warning per item would repeat one message down the list and still
  return a success-shaped result.
- **Applicability that depends on the target, found while working → skip that
  target** (see [Skips](skips-and-replaced-targets.md)). `quantize` on an audio
  clip is not knowable until that clip is reached, and the earlier targets can't
  be rolled back.
- **Check before an irreversible step.** When a step can't be undone and a later
  one can fail, check the later one first and refuse both. update-clip checks a
  move (destination, clip type) before shortening the clip.
- **A device list that reads through its own inserts** is refused before
  anything is created ([lists of paths](object-paths/lists-of-paths.md)).
- **A target named twice is refused**, in every tool, before any work. Two
  params that name the same target, whether they agree or not:
  - a param that names it on its own (`path`, `slot`, `slots`, `devicePath`,
    `toPath`) with a second name for it (`trackIndex`, `sceneIndex`, `takeLane`
    beside a path with a lane segment);
  - a published param with the deprecated spelling it replaced (`path` and
    `slot`, `toPath` and `toSlot`, `arrangementSplit` and `split`, `startTime`
    and `startLocator`, `arrangementStart` and `locator`), or with a position
    spelled in its own coordinate (`toPath: "t0[5|1]"` and `arrangementStart`);
  - `sends` beside the deprecated `sendGainDb` or `sendReturn` (update-track,
    update-device), whatever the values: one list or the other, never both;
  - `id` beside `ids` or the tool's own id spelling (`clipId`, `trackId`, ...),
    and `path` beside `paths`, whatever the values: a param and its alias are
    never sent together. Same for create-device's `deviceName` and its `device`
    alias.

  One wording, built by `refuseNamedTwice`:
  `<param> names the <noun> on its own - don't send <params> with it`, listing
  only the params sent, with an optional note on the end
  (`(slot is deprecated)`). Not this: an `id` beside a `path` (in the read tools
  a second target), a `slot` list beside a bare `trackIndex` on create-clip
  (session slots plus an arrangement track), `trackType` (a category),
  `arrangementStart` beside a clip-slot destination of `duplicate`, and
  `routeToSource` with `withoutClips`/`withoutDevices`.

- **`count` with a destination list**, and `capture` with `count` on
  create-scene: refused, since the destinations already say how many.
- **A bad transform arg** is refused when it does not depend on the clip's
  meter, and skipped per clip when it does. A compound assignment of a
  `swing()`/`quant()` call (`timing += swing(...)`) is refused the same way, as
  is a `swing()` amount at or past its grid (`swing(0.56, n/8)`), and a waveform
  period that uses a note property (`sin(note.start * 6.28)`)
  ([transform spec](../transforms/README.md)).

## A param only another action reads

A tool with actions (or scopes, or a mode param such as `type` or `warpOp`)
publishes one schema for all of them. A param that only other values of that
call-level param read is refused, built by `refuseParamsOutsideAction` so every
tool words it the same way:

```
similarTo is only for action "find-similar"; this call has action "search".
Change the action or drop similarTo.
```

- A defaulted action counts like an explicit one. A value the schema fills in
  (`ppal-library`'s `kind: "audio"`) can't be told from one the caller sent, so
  only another value counts as sent.
- A value no action can use is refused too (`deviceKind: "midifx"` on
  `list-plugins`).
- A param that doesn't suit one _target_ stays a skip: `quantize` on an audio
  clip, a warp param on a MIDI clip. Only a param whose home is another value of
  a call-level param is refused.
- A write that would drop a whole stored document (`ppal-context`) throws a
  message naming `force`, rather than returning the document beside a warning.
- Top-level search filters beside `searches` are refused: the call can't say
  whether they were meant for every search or none.

Warning and continuing would guess the param was the mistake and run the action
anyway. Reading the param as implying the action guesses the other way, and
needs a priority rule once two params imply two actions.

## A remote script that is out of date

A remote script older than the server's minimum (`MIN_REMOTE_SCRIPT_VERSION`) is
treated as missing: its requests are held back before they are sent, so nothing
is asked of Live, and every caller falls back or refuses as it does when no
script answers. Where the answer tells the model the script is needed or
missing, it says instead that the script is out of date, with the running and
needed versions, and to update it with `ppal-manage` or in the chat UI's
Settings → Installation and restart Live. The same goes for a 404 that says the
route is unknown; any other 404 still means "not found". The Skills teach
remote-script features only for a current script.

**Only a caller that has `ppal-manage` is pointed at it.** Small-model mode
never offers the tool, and a toolset can leave it out. Every message that tells
the caller how to get or update the script (preset and plug-in loads, clip
conversion, Simpler pitch bend, an out-of-date or different-build script, and
the same notice in `ppal-connect`) sends such a caller to the chat UI's Settings
→ Installation, then restart Live and choose Producer Pal as a Control Surface.
The clip automation message for a script that isn't running names no install
path, for any caller. The device learns this per request from the caller's own
settings, never from state held between requests. `ppal-manage`'s own undo and
redo refusals still name it, and so do the portal's messages for its own
`ppal-manage`. The chat UI's device swap (a person, over REST) never sees the
tool name.

## A write that waits for another

A queued write that runs short of time before its turn doesn't run and answers
`Not run: waited <N>s for other Producer Pal writes to finish and ran out of time. Nothing changed; retry it.`
A call whose args or context won't fit in one Max message (over ~30 KB of UTF-8)
isn't sent and answers
`... too large for a single Max IPC message: <N> bytes exceeds 30000. Not run. Send less in one call. Nothing changed.`
A write whose caller disconnects while it waits doesn't run either. The queue's
rules (what counts as a write, the timeout budget) are in
[write-queue.md](../../architecture/write-queue.md).
