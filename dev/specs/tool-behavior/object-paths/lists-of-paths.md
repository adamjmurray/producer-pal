# Lists of Paths

How a comma-separated path list is carried out. Part of
[Object Paths](README.md).

A path param takes a comma-separated list (`paths` is accepted as a plural
spelling wherever `path` is). Entries, pairing and skips follow
[Tool Behavior](../README.md#lists-and-pairing); what is specific to paths is
below.

**Creating tracks and scenes reads the list in the caller's coordinates.** Every
entry names a place in the Set as the caller read it, so `t+,t+,t+` appends
three tracks and `t2,t2` inserts two at 2, the second landing after the first.
An entry can move a new object an earlier entry already made, so each result
reports where that object ended up rather than the index Live was asked for.
`count` is the retired spelling of a repeated path, and is refused alongside a
list.

One shape is refused rather than half-applied:

- **A device list that reads through its own changes.** `createDevice` (`path`),
  `updateDevice` and `duplicate` with `type: "device"` (`toPath`) share one
  rule. Each entry runs in turn, and an entry renumbers a chain when it inserts
  at a position, appends anything but an audio effect (Live re-sorts the chain),
  moves a device out of it, or moves drum chains onto or off a pad. A later
  entry that names a position in that chain, or is spelled through it, would
  name something that has moved, so the call is refused before anything is
  created, moved or copied: `path: "t0/d1,t0/d2"`, or a move
  `path: "t0/d2,t0/d5", toPath: "t0/d3/c0,t0/d3/c0"`. The refusal names the
  entry and the earlier one, and says to make separate calls. Entries in chains
  no earlier entry changed are fine, and so is appending an audio effect. An
  entry past the end of its chain, or a move or copy to a track, device or
  return chain that isn't there, changes nothing and skips only itself; a chain
  the path would make still counts. Tracks and scenes have no such case: they
  sit in one flat list each, so the tool can work out every final position up
  front.
