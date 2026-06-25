---
title: "The Bridge: JSON Over Patch Cables"
description:
  How Producer Pal connects its Node.js MCP server to the Live API engine inside
  one Max for Live device — sending JSON between two JavaScript runtimes over
  Max patch cables, with a chunking scheme for large messages and a trick for
  capturing warnings on the way back.
---

# The Bridge: JSON Over Patch Cables

[Running Inside Ableton Live](/how-it-works/running-inside-live) covers _why_
Producer Pal fuses a Node.js server and Live's full API into one Max for Live
device. This page is the deeper, more technical look at _how_ they actually talk
to each other: two separate JavaScript runtimes sending **JSON over Max patch
cables**.

It's a fun corner of the project, with a couple of real problems that had to be
solved along the way.

## Two runtimes in one device

Inside the Producer Pal device there are two JavaScript objects wired together
in the Max patch:

- **`node.script`** runs `mcp-server.mjs` — the full **Node.js** MCP server.
  This is where the AI connects, where npm packages and the network live, but it
  has **no** access to the Live API.
- **`v8`** runs `live-api-adapter.js` — a JavaScript engine with **direct access
  to the Live API**, but no Node.js, no npm, and no network.

Neither one can call the other directly. They live in separate runtimes. The
only thing connecting them is the Max patch itself: **patch cables** between the
two objects, carrying Max messages back and forth. So Producer Pal's bridge is
built out of exactly that — every request and response is a Max message sent
down a cable from one runtime to the other.

A Max message is just a list of "atoms" (symbols and numbers). To move a rich
tool call across that wire, Producer Pal serializes everything to **JSON
strings** and ships them as atoms.

Here's the actual top-level patch, with the bridge wiring right out in the open:

![The main Producer Pal Max patch, showing the node.script and v8 objects wired together](/img/main-max-patch.png)

You can pick out `node.script ./mcp-server.mjs` and `v8 ./live-api-adapter.js`
near the center, with patch cables running between them. Most of the other boxes
are plumbing for the device itself: the many **`s ---…`** (send) and
**`r ---…`** (receive) objects are named wireless connections that let this main
tab talk to the device's other tabs — **Context** and **Setup** — and to the
**server status display** (the `p node-status` subpatcher shown as a bpatcher).
Sends and receives keep that cross-tab messaging tidy without dragging cables
all over the patch; the bridge proper is just the `node.script` ↔ `v8` pair.

## A round trip

When the AI calls a tool, here's the path the data takes:

1. **Node → V8 (request).** The MCP server emits a Max message:

   ```
   mcp_request  <requestId>  <toolName>  <argsJSON>  <contextJSON>
   ```

   The `requestId` is a UUID used to match the eventual response back to the
   waiting promise. The patch routes this message to the `v8` object's
   `mcp_request()` handler.

2. **V8 does the work.** It parses the JSON, runs the tool against the Live API
   (launching clips, writing notes, reading tracks — whatever was asked), and
   builds a result object.

3. **V8 → Node (response).** It serializes the result back to JSON and sends it
   home as an `mcp_response` message, which the server matches to the original
   `requestId` and hands back to the AI.

Conceptually simple. Two things make it harder than it looks.

## Problem 1: messages have a maximum length

A single Max message atom can't be arbitrarily long — there's a hard ceiling
around **32,767 characters**. Producer Pal's responses routinely blow past that:
reading a busy track, or returning a clip full of notes, can produce hundreds of
kilobytes of JSON. Send that as one atom and Max silently truncates it,
corrupting the message.

The fix is **chunking**. Before sending, the V8 side splits the JSON string into
pieces small enough to survive the wire:

```
MAX_CHUNK_SIZE = 30000   // ~30 KB per chunk, comfortably under the 32,767 limit
MAX_CHUNKS     = 100     // up to ~3 MB per response
```

`planChunks()` slices the JSON left-to-right into 30 KB chunks and sends them as
**multiple atoms in one message**. The receiver glues them back together with a
plain `join("")`. This relies on one guarantee Max gives us: the atoms of a
single message arrive **in the order they were sent**, so no per-chunk sequence
numbers are needed.

If a response somehow needs more than 100 chunks (~3 MB), Producer Pal refuses
to send a corrupt blob — it replaces the payload with a clear "response too
large" error instead. (You can find the chunking logic in
[`mcp-response-utils.ts`](https://github.com/adamjmurray/producer-pal/blob/main/src/shared/mcp-response-utils.ts).)

## Problem 2: capturing warnings from the V8 side

The second problem is subtler. While a tool runs, the V8 code may want to warn
the AI about something — _"quantize parameter ignored for audio clip,"_ for
example. Producer Pal uses warn-and-skip rather than hard failures, so these
warnings need to reach the AI as part of the response.

But there's a catch: **a runtime's log and error output doesn't travel down
patch cables.** When the `v8` object prints to the Max console, that text goes
to the Max window — it's not part of any message coming out of the object. So we
can't just rely on console output; the warnings have to be deliberately routed
onto an outlet and then **stitched into the response message** before it crosses
back to Node.

Producer Pal does this in two halves — the V8 code and the Max patch cooperate:

**On the V8 side**, the object has **two outlets**:

- **Outlet 0** carries the actual result: the chunked JSON, terminated by a
  special delimiter string.
- **Outlet 1** carries **warnings**. `console.warn()` is wired to emit each
  warning string out of outlet 1 (see
  [`v8-max-console.ts`](https://github.com/adamjmurray/producer-pal/blob/main/src/shared/v8-max-console.ts)).

**In the Max patch**, a small subpatcher named **`route-results-and-warnings`**
recombines those two separate streams into a single message:

![The route-results-and-warnings subpatcher: inlet 1 and inlet 2 feeding a t l b zlclear, a list.group 1000, and a list.join](/img/main-patch-route-results-and-warnings.png)

Inlet 1 receives the result (the chunked JSON and its delimiter); inlet 2
receives warnings. The `list.group 1000` object **buffers warnings** as they
arrive, and when the result comes in, `t l b zlclear` triggers `list.join` to
**append the buffered warnings onto the end of the result list** (then clears
the buffer for the next request). The merged message is what finally crosses
back to Node.

The key to keeping the two halves apart is a **demarking symbol** that V8 places
between the JSON chunks and the warnings:

```
$$___MAX_ERRORS___$$
```

So the full response message that arrives back at the Node server looks like
this:

```
mcp_response  <requestId>  <chunk1> <chunk2> … <chunkN>  $$___MAX_ERRORS___$$  <warning1> <warning2> …
└─ message ─┘ └─ id ─────┘ └──── JSON, split at 30 KB ───┘ └─── delimiter ───┘ └──── captured warnings ────┘
```

The Node side splits on that delimiter:

- Everything **before** it is JSON chunks → reassemble and `JSON.parse()`.
- Everything **after** it is captured warnings → each one is appended to the
  response as a `WARNING:` text block.

That last step is what makes warn-and-skip real, actionable feedback: the
warnings the V8 code emitted while talking to the Live API end up as text the AI
actually reads in the tool result, not messages lost in the Max console. The
delimiter also doubles as an integrity check — if it's missing, the receiver
throws loudly instead of trying to parse a malformed message.

## Why it's built this way

Two separate JavaScript runtimes, JSON marshalled into Max atoms, chunked to
dodge a length limit, with a side channel for warnings merged back in by the
patch — it's more machinery than a single process would need. But it's exactly
this machinery that lets one Max for Live device offer **both** a modern Node.js
server **and** complete, real-time Live control at once. Solving the bridge
once, properly, is what keeps everything above it simple: you drop in
[one device](/how-it-works/running-inside-live) and the whole thing just works.
