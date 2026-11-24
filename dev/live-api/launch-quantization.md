# Launch quantization and synced launch

How a session clip can be started exactly on the loop start of clips that are
already playing (`play-session-clips-synced`, `auto: "play-clip-synced"`), and
why the obvious way doesn't work. Code:
`src/tools/session/helpers/playback/synced-launch.ts`.

## What Live does

- A launch waits for the next line of the quantization grid, and **the grid
  counts from song time 0**, not from a playing clip. A clip looping 2 bars that
  started 1 bar in has its loop starts off the 2 bar grid.
- A clip's own `launch_quantization` overrides the Live Set's
  `clip_trigger_quantization`, global None included.
- Live latches the launch when `fire` runs. Changing `launch_quantization` right
  after `fire` does not change that launch.

## What follows

- Raising the quantization alone can't sync a clip: every grid is anchored to
  song time 0, so a loop that started off the grid has no grid line on its
  start. Only a grid with a line on the loop start works, and then only when no
  line comes before it.
- So the clip gets a temporary `launch_quantization`: the smallest grid that has
  a line on the loop start and none between now and it. It is fired, and the
  value is put back in the same tick.
- Grids are the bar multiples and the note values that divide the bar. Triplets
  and note values that don't divide it are left out: whether they count from the
  bar or from song time only shows when they don't divide it.
- When no grid fits yet (the loop start is further off than the largest grid
  that has a line on it), the call polls until one does, then fires. The wait
  ends as soon as a grid fits, when the transport stops, or at the request
  deadline less 5 s (30 s with no deadline), whichever comes first. A call that
  needs no wait fires however little time is left.
- A grid no longer than 0.15 s (in beats, at the current tempo) is never used:
  the loop start is aimed past before such a grid's last line comes, since the
  fire could land after it. A loop start nearer than 0.15 s is skipped for the
  next one for the same reason. A loop start only on grids too short to use is
  treated as on no grid. This applies to the first fire of a call only: its loop
  start and grid are then kept for the call's other clips (see the tool-behavior
  spec for when a later clip fires plainly).
- A loop start on no grid at all (the loop was launched unquantized) can't be
  hit, so the clip fires plainly and the result says so.
- Every playing loop must restart at the longest loop's start, so each one's
  length has to divide the longest's, and their starts have to line up.
  Otherwise there is no one loop start to sync to, and the call is refused.
- A clip whose playhead is past `loop_end` isn't looping, so it isn't counted.
