# ppal-manage

Actions on Live itself, not on a track, clip or device: install the remote
script and the device, add Producer Pal to the open Set, update the running
Producer Pal device, and undo and redo in Live's history. One call is one
action, so there are no target lists, no entries and no skips: a call that can't
do its action throws. The one call with two parts, `install-producer-pal`,
reports each part for itself (see [below](#install-producer-pal)).

It is not a target-list write, so it doesn't run through the
[write pipeline](../../tools/write-pipeline.md), and the tool closes no undo
step: an end clears the guard that stops the next undo from removing Producer
Pal (see [`undo` and `redo`](#undo-and-redo)), and an install changes nothing in
the Set. The one exception is the `update-producer-pal` swap, which the remote
script closes itself.

Nothing installs on its own: every install or update is one of these calls,
never a side effect of the portal starting.

Small-model mode leaves it out entirely (not in MCP, not in REST), and users can
switch it off like any tool. It sits in the `core` group. Otherwise it is always
listed, even without the remote script: clients cache the tool list, so a tool
hidden until the script is installed would be missing when it's needed.

## Refusals before anything runs

- A missing or unknown `action` throws, listing the five:
  `action must be one of: install-producer-pal, add-producer-pal, update-producer-pal, undo, redo`.
- **`install-remote-script` is the retired name of `install-producer-pal`.** It
  is accepted everywhere the new name is, and read as it. The schema and
  descriptions publish only the new name. The connector and the device can be
  different versions, so an older device advertises the old name and an older
  connector sends it. The mapping lives in one place (`MANAGE_ACTION_ALIASES` in
  `manage-contract.ts`) and serves the device's schema, the argument checks the
  portal shares, and the portal's own check for an older device.
- `userLibrary` is only for `install-producer-pal`, `add-producer-pal` and
  `update-producer-pal`. On `undo` or `redo` it is refused as any
  [param only another action reads](refusals.md#a-param-only-another-action-reads).

## `install-producer-pal`

Writes the remote script and the Producer Pal device into the User Library, as
Settings → Installation does. It runs in Node and needs no running remote
script.

- **Where:** `userLibrary` if given. Otherwise, on the device, the User Library
  Producer Pal finds (the lookup the Chat UI uses); in the portal, the one the
  running remote script reports, then the one Producer Pal finds, the order
  `add-producer-pal` and `update-producer-pal` use, so the files land where
  `add-producer-pal` later looks. Both files go to the same library.
- **The script** is replaced whole, whatever is there.
- **The plug-in host wrappers** (`PPal Plug-in Effect` and
  `PPal Plug-in Instrument`) go in beside them, in the folders Live files Max
  audio effects and instruments under, in a build with `ENABLE_HOSTED_PLUGINS`.
  They are embedded in the bundle like the script. Bytes decide: a wrapper that
  differs is replaced, one that matches is left (`current`). They are not
  version-aware and never `kept`. A release build embeds and installs none, and
  the result has no `pluginHost`.
- **The device** is version-aware, as the Chat UI's install without `force`: an
  older one is replaced; the same one is left (`current`); a newer one, or one
  that can't be ordered against it, is left (`kept`, with a `detail`). The file
  copied is the running device's own when the device answers, else the one that
  shipped with the portal. A development device (not frozen) can't be copied.
- **Result:** `{ remoteScript, device, pluginHost?, nextSteps }`. Each of the
  first two is one of
  - `{ status, path, version?, detail? }`, where `status` is `installed`,
    `updated`, `current` or `kept` (`detail` explains an update or a kept copy),
    or
  - `{ ok: false, path?, detail }`, for a file that couldn't be installed:
    `detail` says why and what it left.

  `pluginHost` is one `{ name, status, path, detail? }` or
  `{ name, ok: false, path, detail }` per wrapper, the same shapes (`status` is
  `installed`, `updated` or `current`). An update says a Set that's already open
  keeps the old wrapper until it's reopened. A wrapper that fails (Windows can
  lock a file Live has open: the `detail` says to close the Sets that use it, or
  quit Live, then run `install-producer-pal` again) never fails the call and
  never hides the others: the script or device installed still reports as
  installed, and `nextSteps` adds that the wrapper is missing and to call
  `install-producer-pal` again. Two wrappers' outcomes are independent, and
  independent of the device's: they are tried even when the device was `kept` or
  failed.

  `nextSteps` tells the user to restart Live and choose Producer Pal as a
  Control Surface in Settings → Tempo & MIDI (Input and Output None). When
  Producer Pal isn't running yet it adds: call `add-producer-pal` (the model
  asks first), and the device is already in the User Library, so the user can
  also drag it onto a MIDI track in Live right away, without the restart. When
  Producer Pal is already running, it ends with: once the user has restarted,
  call `ppal-connect` with `versionCheck: true`, then a note: never connected in
  this chat? Call a plain one instead (see [ppal-connect](ppal-connect.md)).

- **One part fails:** the call does what it can and reports both. It is a
  result, not an error: the part that failed is `{ ok: false, path?, detail }`,
  the other says what it did, and `nextSteps` says which half is missing and how
  to retry. It never claims success for the failed half and never hides a
  completed one.
- **Both fail:** (the script and the device; the wrappers don't count) throws,
  naming both reasons
  (`nothing was installed. Remote script: <detail>. Device: <detail>.`), or the
  reason once when it is the same.
- **No User Library found, none given:** throws, saying nothing was installed
  and to ask the user for the path (Live: Settings → Library → Location of User
  Library) and pass it as `userLibrary`. Neither part was tried.
- **A path that isn't an absolute path to a folder:** throws, saying nothing was
  installed, with the same advice.
- **A script write that fails partway:** the script part is
  `{ ok: false, detail }`, with `detail` saying what it left. The new copy is
  written beside the old and swapped in, so the old install is unchanged and no
  half-written folder is kept (if it can't be removed, the `detail` names where
  it is). If the swap itself fails and the old copy can't be put back, it says
  the previous copy was moved aside (naming where) and the remote script is
  missing until the install runs again. A device copy that fails (Windows can
  lock a file Live has loaded) is `{ ok: false, path, detail }` the same way;
  the old device file is unchanged.
- **No answer from Node in time:** throws, saying the install may or may not
  have finished and to run it again. Repeating it is safe: the script is
  replaced whole and the device is version-aware.
- **A failure that provably ran no route:** throws
  `nothing was installed: <the real error>`. These are an unknown route, an
  unreadable request on Node's side, a request too large to send, and a send
  failure.
- **Any other failure** (a handler that threw, an unreadable answer, a reply too
  large to send back, Node's own route timeout) may follow an install that
  already wrote files, so it gets the same "may or may not have finished" text
  as a timeout, with the real error in parentheses.

## `add-producer-pal`

Puts the Producer Pal device on a new MIDI track of the open Set. It only works
while Producer Pal isn't running, so only the portal answers it (see
[While Producer Pal isn't running](#while-producer-pal-isnt-running)). The tool
description tells the model to ask the user first, since it changes their Set.

- **On the device:** throws `Producer Pal is already running in this Live Set`,
  after the same argument checks as every action.
- **Result:** `{ track: { path, name }, device, nextSteps }`, where `path` is
  the track path the tools use (`t3`), plus `pluginHost` (as above) in a build
  that hosts plug-ins. `device` says what happened to the file in the User
  Library (installed, updated, already current, kept because the installed one
  is newer or can't be ordered, or kept because the update failed, with why).
  `nextSteps` is `Call ppal-connect next.`
- **An installed device newer than the bundled one:** it is loaded as it is, and
  `device` adds that this portal is older than it and the user should update the
  portal (the npx package or the Claude Desktop extension).
- **A remote script that is too old:** refused before anything is copied. The
  error says to update it, that nothing was added, and to call
  `add-producer-pal` again after the user restarts Live.
- **Time limit:** the load (and a not-found retried for up to 15 s) and the wait
  for the server share a deadline of about 50 s, as described under
  `update-producer-pal`.
- **No running remote script:** an error, because the Set wasn't changed. The
  device file is still put in the User Library (the same copy, with the same
  `device` note, as above), so the error says what the call did leave: nothing
  was added to the Live Set, the device file's path, and two ways forward. (1)
  Open Live and drag the file from the browser (User Library) onto a MIDI track.
  (2) Finish the remote script setup (`install-producer-pal` if the script isn't
  installed, or just restart Live and choose the Control Surface if it is), then
  call `add-producer-pal` again. A call that couldn't do the thing it was made
  for is an error, even when it left a prepared file; the error, not a result,
  is what stops the model reporting the device as added. In a build that hosts
  plug-ins the wrappers are copied too, and the error says what became of each.
  With no device bundled, no User Library found, or a copy that fails with no
  file already there, the error says nothing was added and nothing was copied.
  If the lookup of the script's state fails after the copy, the error still says
  where the file is and gives the steps for a script that isn't installed.

## `update-producer-pal`

Replaces the running Producer Pal device with the one this portal ships, in
place: same track, same position, and the project context (kept in a device
parameter) survives. Only the portal answers it, online or off, because the
device being replaced dies with the swap. The tool description tells the model
to ask the user first.

- **On the device** (Chat UI, a direct HTTP client, or a portal too old to
  answer it): throws that the update runs through the portal (the npx package or
  the Claude Desktop extension), after the same argument checks as every action.
- **Portal flow**, each step refusing before the swap (before step 5, "nothing
  was changed"; from step 5 on, the Live Set wasn't changed, and the message
  adds that the Producer Pal device in the User Library was updated when the
  copy wrote it):
  1. Producer Pal not answering: the offline guidance below, which points at
     `add-producer-pal`.
  2. The running version is the device's own (`serverInfo.version`, asked
     afresh). Equal to the portal's: a plain success saying there is nothing to
     update. Newer than the portal's: refused, with how to update the portal.
     Different but impossible to order: refused, saying which is newer can't be
     told. No version reported: refused. `-rcN` versions of one x.y.z order by
     N; other pre-release tags can't be ordered against each other.
  3. No bundled device: refused, with the install guide.
  4. Remote script not running or too old: refused with nothing copied (unlike
     `add-producer-pal`, which still installs the device file; an update has no
     use for one without a swap), and an old script that lacks the
     `/replace-producer-pal` route reads as too old. `userLibrary` is settled as
     for `add-producer-pal`.
  5. The bundled device is copied into the User Library. A copy that fails
     (Windows can lock a file Live has loaded) refuses, saying the file may be
     in use. Whatever file would load, it must name a version newer than the
     running device's, else the call refuses before the swap (a swap for the
     same version would only restart the device). A different file left alone is
     loaded only on those terms; the result then says so, and that the portal is
     older when the file is newer than the portal's (else that which is newer
     can't be told).
  6. The remote script's `/replace-producer-pal` hot-swaps the Set's one
     Producer Pal device with that file (a not-found is asked again for up to 15
     s, within the call's time limit below). A refusal there (none in the Set,
     more than one, bad file) says the Live Set wasn't changed, and whether the
     library file was updated.
  7. The bridge drops its connection and reconnects until a server answers with
     a newer version than the old one (up to 30 s, within the call's time limit
     below), then tells the client to re-list tools, which may differ between
     versions.
- **Time limit:** `add-producer-pal` and `update-producer-pal` finish in about
  50 s (the last request gets a ~1 s reply grace), since a client with a 60 s
  tool timeout reports failure while Live goes on to change the Set. The steps
  share one deadline and each takes what is left: the load or swap request (and
  its not-found retries) and the wait for the server. A step that runs out of
  time after the request was sent says the device may have been added or
  replaced, as for any other lost answer; one that runs out before it was sent
  says nothing changed.
- **Undo:** the remote script closes the swap as its own undo step (and clears
  the guard, as any write does), since the server that would close it dies with
  the swap. Left open, it would merge with the next edit. Undoing that step puts
  the old build back, which the guard allows: Producer Pal is still in the Set.
  That undo replaces the server answering it, so its answer is lost; call
  `ppal-connect` with `versionCheck: true` to see which build runs.
- **After Live may have acted** (no answer to the swap request, a lost
  connection, a 500, a 504 that started), the error says the device may have
  been replaced and to call `ppal-connect` with `versionCheck: true` to see
  which version runs. If the swap went through but no new server answers in
  time, it says Live replaced the device, to wait and call `ppal-connect` with
  `versionCheck: true`, and not to update again (or, if the old version still
  answers, to ask the user to check the device in Live). Each of these ends with
  the never-connected note.
- **Result:** `{ device: { from, to }, track: { path, name }, nextSteps }`,
  where `path` is `t3`, `rt0` or `mt` as in the tools, plus `note` when the
  loaded file wasn't the portal's, and `pluginHost` (as under
  `install-producer-pal`) in a build that hosts plug-ins. The wrappers are
  copied right after the device and before the swap; a wrapper that fails never
  refuses the update. `nextSteps` is
  `Now call ppal-connect to load the Skills and confirm the update.` until a
  plain `ppal-connect` has worked through this portal (the chat can't have
  connected yet), and after that
  `Now call ppal-connect with versionCheck: true to confirm the update. (If this chat hasn't called ppal-connect yet, call it without versionCheck.)`
  It is worded as the required next step, so the model doesn't read it as
  optional.
- **The `ppal-connect` hint** comes from the portal, since old devices can't
  learn new wording: when a successful `ppal-connect` finds a device older than
  the portal, the portal appends a block telling the model to ask the user, then
  call this action (or, without `ppal-manage`, to tell the user to update the
  device). The device's own connect line only says when the _portal_ is older.

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
    (`/undo/end`; a call that changes nothing doesn't count: a read, a refusal
    before anything was written, or a write whose every target was skipped
    without leaving anything in the Set), a step the same way is refused up
    front, touching nothing:
    `The next undo would remove Producer Pal from the Set, so it wasn't done. If the user wants that, or the next step is an edit of theirs, they can do it in Live.`
    A step in the other direction clears it, since the next step this way is
    then a different one. The memory lives on the bridge, so loading another Set
    starts clear.
- **No remote script, or one too old for the route:** throws, saying the remote
  script is needed and how to install it (`ppal-manage` with
  `action: "install-producer-pal"`, then restart Live, or Settings → Remote
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
- **`install-producer-pal`** runs in the portal through the same shared steps as
  the device's route and gives the same `{ remoteScript, device, nextSteps }`
  and the same errors, installing the device that shipped with the portal. The
  portal also answers it, under either name, while the device is up, when the
  running device is older than the portal, so the newer script and device get
  installed; there `nextSteps` stops at the restart, since Producer Pal is
  already in the Set.
- **`add-producer-pal`** runs the steps below.
- **`update-producer-pal`** is answered by the portal whether the device is up
  or not; see [above](#update-producer-pal). When the device is down it gets the
  guidance below.
- **`undo` and `redo`** need the device, so they get the guidance below.
- **Every other offline call** gets guidance, worded by whether Live's remote
  script answers a ping (capped at about 1 s):
  - **Answers:** "Producer Pal isn't in this Live Set". Without `ppal-manage`,
    it says to add the device by hand.
  - **Doesn't:** Live 12.3+ must be running with the device loaded, plus the
    setup URL.
  - **With `ppal-manage` listed**, it also says where things are and what the
    next step does. It never throws: a lookup that fails drops its detail and
    leaves the general wording. The ping isn't repeated.
    - **User Library:** the one the running script reports, else the one
      Producer Pal finds (the order `add-producer-pal` uses). When none is
      found, it tells the model to ask the user for the path and pass it as
      `userLibrary`.
    - **Remote script (not running):** not installed (offers
      `install-producer-pal`, which installs the script and the device, and says
      where the script goes), installed and this version or newer (just restart
      Live and choose the Control Surface), or installed older or unreadable
      (offer the update, which is the same call).
    - **Remote script (running):** if it is older than the minimum, say to
      update it before adding the device.
    - **Newer than the portal:** when the remote script (installed or running)
      or the installed device is newer than this portal, it adds that the portal
      is older and the user should update it.
    - **Device:** one story per case. When the hint advises
      `install-producer-pal` (script missing, out of date, unreadable, or no
      library found), that call puts the device in place, so the hint says
      `add-producer-pal` then just adds it. When it doesn't (script current, or
      the script is already running), it says what `add-producer-pal` will do:
      install to the path, update it (installed version to bundled version), add
      the one already there (nothing to install), or add a newer or different
      one as is. With no device bundled, it sends the user to the install guide
      and doesn't point at `add-producer-pal`.
