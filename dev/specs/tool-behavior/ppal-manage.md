# ppal-manage

Actions on Live itself, not on a track, clip or device: install the remote
script, add Producer Pal to the open Set, and undo and redo in Live's history.
One call is one action, so there are no target lists, no entries and no skips: a
call that can't do its action throws.

It is not a target-list write, so it doesn't run through the
[write pipeline](../../tools/write-pipeline.md), and it gets no undo step of its
own: closing one right after an undo could wipe Live's redo history, and an
install changes nothing in the Set.

Small-model mode leaves it out entirely (not in MCP, not in REST), and users can
switch it off like any tool. It sits in the `core` group.

## Refusals before anything runs

- A missing or unknown `action` throws, listing the four:
  `action must be one of: install-remote-script, add-producer-pal, undo, redo`.
- `userLibrary` is only for `install-remote-script` and `add-producer-pal`. On
  `undo` or `redo` it is refused as any
  [param only another action reads](README.md#a-param-only-another-action-reads).

## `install-remote-script`

Writes the bundled script into the User Library, replacing any copy, as Settings
→ Remote Script does. It runs in Node and needs no running remote script.

- **Where:** `userLibrary` if given, else the User Library Producer Pal finds
  (the same lookup the Chat UI uses).
- **Result:** `{ version, path, nextSteps }`. `nextSteps` tells the user to
  choose Producer Pal as a Control Surface in Settings → Link, Tempo & MIDI on a
  first install, then restart Live.
- **No User Library found, none given:** throws, saying nothing was installed
  and to ask the user for the path (Live: Settings → Library → Location of User
  Library) and pass it as `userLibrary`.
- **A path that isn't an absolute path to a folder:** throws, saying nothing was
  installed, with the same advice.
- **A write that fails partway:** throws, saying what it left. The new copy is
  written beside the old and swapped in, so the old install is unchanged and no
  half-written folder is kept. If the swap itself fails and the old copy can't
  be put back, it says the previous copy was moved aside (the error names where)
  and the remote script is missing until the install runs again.
- **No answer from Node:** throws, saying the install may or may not have
  finished and to run it again. An install replaces the old copy whole, so
  repeating it is safe.

## `add-producer-pal`

Puts the Producer Pal device on a new MIDI track of the open Set. It only works
while Producer Pal isn't running, so only the portal answers it (see
[While Producer Pal isn't running](#while-producer-pal-isnt-running)). The tool
description tells the model to ask the user first, since it changes their Set.

- **On the device:** throws `Producer Pal is already running in this Live Set`,
  after the same argument checks as every action.
- **Result:** `{ track: { index, name }, device, nextSteps }`. `device` says
  what happened to the file in the User Library (installed, updated, already
  current, kept because the installed one is newer or can't be ordered, or kept
  because the update failed, with why). `nextSteps` is `Call ppal-connect next.`

## `undo` and `redo`

Step Live's own history, through the remote script's `/undo/undo` and
`/undo/redo`. The history holds the user's edits in Live as well as Producer
Pal's, so an undo can revert something the user did; the tool description says
so. One step is one write call, since each is closed as one undo step.

- **`steps`:** how many steps, a whole number from 1 to 50, default 1. Above 50
  (or below 1, or not whole) is refused, never cut down: the caller would think
  it had gone back further than it did. Like `userLibrary`, it is refused on the
  other action.
- **Result:** `{ undone | redone, canUndo, canRedo, stopped? }`: the steps
  taken, and what Live can do next, read after the last. `stopped` says why
  fewer were taken than asked (`nothing more to undo`, or the guard below).
- **Nothing to step at all:** throws `nothing to undo` or `nothing to redo`. The
  remote script checks `can_undo` / `can_redo` first and calls nothing.
- **Producer Pal is never removed by a step.** The step that inserted it, when
  the Set was made with it, undoes to a Set without it, which kills the server
  answering the call. Before each step the remote script counts the devices that
  are or hold Producer Pal; if a step lowers the count it reverses that step at
  once, in the same call, and stops. Applies to undo and redo.
  - The server comes back as a new process, so the call's answer is usually lost
    and the caller gets the "may have been applied" error below. If the answer
    does arrive (a second Producer Pal in the Set), the result reports
    `undone: k` and `stopped`.
  - The remote script remembers the trip. Until Producer Pal writes again
    (`/undo/end`), a step the same way is refused up front, touching nothing:
    `The next undo would remove Producer Pal from the Set, so it wasn't done. If the user wants that, or the next step is an edit of theirs, they can do it in Live.`
    A step in the other direction clears it, since the next step this way is
    then a different one. The memory lives on the bridge, so loading another Set
    starts clear.
- **No remote script, or one too old for the route:** throws, saying the remote
  script is needed and how to install it (`ppal-manage` with
  `action: "install-remote-script"`, then restart Live, or Settings → Remote
  Script). The wording is shared with every other remote-script-only feature.
- **No time left before the request left:** throws, saying the step wasn't
  started and to re-run it.
- **A failure after the request went out** (no answer, a lost connection, a job
  Live started and didn't finish): throws, saying the step may have been applied
  and to read the Live Set before trying again. It never says nothing happened.

## While Producer Pal isn't running

The portal (the npx and Desktop-extension bridge) answers some calls itself when
the device doesn't. It does this only when the failure is a connection failure,
not an error the device sent, and only for `ppal-manage` when this portal lists
it (small-model mode and `--disable-tools` drop it).

- **`ppal-manage` args are checked first**, by the same code the device uses
  (`manage-args.ts`), so a bad call reads the same either way. Errors read
  `Error: <why>`, as on the device.
- **`install-remote-script`** runs in the portal through the same code as the
  device's route and gives the same `{ version, path, nextSteps }` and the same
  errors.
- **`add-producer-pal`** runs the steps below.
- **`undo` and `redo`** need the device, so they get the guidance below.
- **Every other offline call** gets guidance, worded by whether Live's remote
  script answers a ping (capped at about 1 s):
  - **Answers:** "Producer Pal isn't in this Live Set", and to tell the user to
    add the device by hand.
  - **Doesn't:** Live 12.3+ must be running with the device loaded, plus the
    setup URL. When `ppal-manage` is listed, it adds that
    `install-remote-script` works now, then the user restarts Live and chooses
    the Control Surface.
