# ppal-connect

The first call in a chat. It says Producer Pal is connected, what runs, and
hands the model what it needs to work. It reads the Set and changes nothing, so
it has no entries, skips or refusals of its own.

It has two modes, picked by one optional boolean, `versionCheck`.

## Full connect (default)

The result is one text block from the device (`connected`, `producerPalVersion`,
`abletonLiveVersion`, and the Live Set overview), then blocks added Node-side,
because only Node can read files and headers. In this order:

1. Portal version line, when the request came through a portal.
2. Remote script line.
3. Skills.
4. Project context.
5. Global context.
6. Memory index.
7. Next step, always last: which of project context, global context and memory
   are empty, and what to do now.

A block with nothing to say is left out. A block that fails to build is left out
alone, and the others still arrive.

## Version check (`versionCheck: true`)

For re-checking after an install, update or Live restart, in a chat that already
connected. It exists so those flows don't re-send the Skills, contexts and
memory index. Not for the first connect in a chat: it carries none of what the
model needs to work.

The result is the device's
`{ connected, producerPalVersion, abletonLiveVersion }` with no Live Set
overview (the Set isn't read), then:

1. Portal version line, when the request came through a portal.
2. Remote script line.
3. **New-chat line**, only when nothing needs fixing (below).

Skills, project context, global context, memory index and the next step are not
sent. `false` or no `versionCheck` is a full connect. It is a strict boolean:
over MCP a string such as `"true"` is refused by schema validation, like every
other boolean param.

### The new-chat line

> Everything is up to date. If this chat only connected and updated Producer
> Pal, suggest the user start a new chat so it loads the new version's skills
> and tools.

It appears only when all of these hold:

- The remote script is running this build's version, the installed copy is not
  behind or newer than this build, and Live runs the installed copy. Not
  installed, not running, behind, newer, restart due, or another program on the
  port each leave a remote script line (or a mismatch) to deal with first, and
  no new-chat line.
- The portal's version, when there is one, equals the device's. A portal older
  than the device gets its update advice in the portal line. A portal newer than
  the device means the device is older than the portal; the portal appends its
  own update hint after the result, and the new-chat line stays out.
- The remote script status could be read. It is read once per connect and shared
  by the remote script line and this one, so they can't disagree. If it can't be
  read, neither adds a line.

A device too old to know `versionCheck` strips the argument (its schema is
`.loose()`), answers a full connect and adds
`WARNING: ignored unexpected argument(s): versionCheck`. It never emits the
new-chat line, and the portal's hint still follows it.

## Pointing at the check

Every result that sends the model back to `ppal-connect` after an install or an
update says to call it with `versionCheck: true`. Where the chat may never have
connected (the `update-producer-pal` result and its failure messages, and the
`ppal-manage` install result once Producer Pal is running), it adds "or plain
`ppal-connect` if this chat hasn't connected yet". The remote script lines that
tell the user to restart Live sit inside a connect result, so they say only
`versionCheck: true`.

`add-producer-pal` is the exception. It runs when Producer Pal wasn't running in
the Set, so the chat may never have connected; its results say to call a full
`ppal-connect`.
