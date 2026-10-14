# Take Lanes

How paths address take lanes, and what writes to a lane can and can't do. Part
of [Object Paths](README.md).

The main arrangement lane has **no segment** — `t0` is it. `Track.take_lanes`
excludes the main lane, so `l0` is the first take lane and the segment index is
the Live API index like every other segment.

A 1-based `l` segment was rejected: `t0/l1` would be the first lane while
`t0/s1` is the second scene. Dropping the segment and keeping `takeLane` as a
sibling param was rejected too: without `l`, a take-lane clip has no correct
result path, and `update-clip` couldn't move one.

`takeLane` (1-based, `0` = main) is a hidden alias mapping `N → l(N-1)` and
`0 → no segment`. `takeLaneName` is deprecated: naming a lane is a property of
the lane, not an address, so it belongs to the lane's own target —
`ppal-update-track` with `path: "t2/l0"` and `name`.

**The lanes themselves are `ppal-update-track`'s.** A lane path there names a
lane to write to: `t2/l<n>` fills in the lanes up to that index, `t2/l+` appends
one, and each `l+` in the list appends its own. `name` is the only param a lane
takes, and every other one the call sent is reported on the lane's entry rather
than refusing the call. A whole call is refused up front when its lanes would
put a track over the cap — lanes can't be deleted, so a half-run list would
strand the ones it made. `ppal-read-track` takes a lane path too, answering with
the lane and, with the `arrangement-clips` include, its clips. Both tools take a
lane's `id` as well, so the id either one reports goes straight back as a
target.

**Lanes made on the way are reported, by every tool.** A path past the last lane
fills the gap, and the entry's `created` names every lane made (`l0-l2`, or `l3`
for one) — create-clip, update-clip moves, `duplicate` of a clip and of a track,
and update-track alike. Lanes are made when the first target that needs them
runs, so a target the call never reaches makes none. Several clips on a lane the
call made share it: the first one written says so. The lanes stay on the entry
when a later step fails, or when Live stops partway through making them: a
failed write lists them under `already changed`, and a move that update-clip
refuses says `take lanes l0-l1 made on t5`, since its path still names the
clip's own track.

**Writes to and from a lane re-create the clip**, because Live's arrangement
duplicate handles neither direction: `TakeLane` has no duplicate API, and
`Track.duplicate_clip_to_arrangement` silently no-ops when the _source_ is a
take-lane clip. So `duplicate` copies main→lane, lane→lane, and lane→main
(promote) by rebuilding the clip from its notes, or from its sample for audio;
envelope automation is dropped, and a warped audio clip's markers reset. A MIDI
copy keeps the source's arrangement length even when its loop is shorter; an
audio copy can't (Live sets no end on `create_audio_clip`), so its entry reports
the length it got. A `duplicate` with `type: "track"` and a lane destination
copies a whole lane the same way — clips only, so the devices, routing, mixer
settings and session clips a new-track copy carries stay behind. Its source is a
track (`t2`, its main lane) or a lane (`t2/l0`, or that lane's id); `t2/l+`
names no source, and a lane can't copy onto itself. A lane source with a bare
track destination (`t2`, its own track or another) promotes the whole lane onto
that track's main lane, replacing the clips already at those positions; it makes
no lane, so its entry reports the track's path with no `created`. A track source
has no such destination — a bare `toPath` there is the new-track copy's, and is
ignored.

**A lane is one-way**: nothing removes a take lane or a clip on one. A move of a
lane clip gets as close as Live allows — `update-clip` copies the content to the
destination (a new position on the same lane, another lane, another track, or a
session slot) and then empties the original in place, leaving a muted
`(moved) ...` placeholder the clip's own result entry says to delete. MIDI
really empties — the notes go. Audio can't: a clip's sample can't be swapped,
and writing a silent clip over it fails too, because an arrangement clip's
extent can't be stretched from the LOM (`end_marker` and `loop_end` accept the
write, `end_time` doesn't follow). So an audio take is only muted. Everything
else that needs the original gone still refuses it: `arrangementSplit` and
`arrangementLength` report a `detail` on the clip's entry and change nothing,
and `ppal-delete` reports the clip `ok: false`. Deleting and comping stay in
Live's UI.
