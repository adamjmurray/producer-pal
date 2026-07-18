---
title: Why Not an Ableton Extension?
description:
  Ableton's new Extensions SDK looks like a natural home for Producer Pal.
  Here's an honest, under-the-hood look at how I weighed it, what the SDK can
  and can't do today, and where things would have to change.
---

# Why Not an Ableton Extension?

Ableton's new **Extensions SDK** lets developers extend Live with JavaScript,
and it's genuinely exciting. So it's a natural thing to wonder: _"Will there be
a Producer Pal extension?"_ I get asked it a lot, and it's a fair question. On
the surface, the SDK looks like it should be the perfect home for a tool like
this.

I've looked into it carefully, more than once, and for now I've landed on _not
yet_. This page is me opening the hood and walking through how I got there, so
you can see the reasoning and weigh it for yourself.

::: tip SHORT ANSWER

As of today, the Extensions SDK can't do several things Producer Pal depends on:
it can't start playback or launch clips and scenes, it can only see part of the
Live Set, and it can't reliably keep track of which clip is which between steps.
The extras it _does_ add (rendering and file import) are things Producer Pal can
already do another way. And the capability people most often hope for, "resample
my synth into audio," it can't do at all.

Producer Pal already runs inside Ableton through **Max for Live**, which handles
all of that today. So an extension would currently mean _less_ capability and
_more_ to install, not a step forward.

:::

The rest of this page walks through each piece in plain terms.

## What an "extension" even is

An Ableton **extension** is a small program, written in JavaScript, that Ableton
Live runs in the background while it's open. The Extensions SDK gives that
program a curated set of commands for working with a Live Set: create a track,
rename a clip, read a tempo, and so on.

It's a real and welcome addition to Live. It was designed for a particular kind
of task: **batch edits and offline processing triggered from Live's own menus**,
like "rename every clip to match a pattern," or "strip silence from this audio
file." Ableton's own documentation is upfront that extensions aren't aimed at
real-time control, and the toolset reflects that focus.

Producer Pal is a different kind of beast. An AI assistant needs to do whatever
you ask, whenever you ask it, including pressing play, launching a scene, and
keeping track of dozens of clips across a long conversation. That's where the
extension model, as it stands today, runs out of room.

## What the SDK can't do that Producer Pal needs

### It can't control playback

There's no command in the SDK to start or stop playback, or to launch a clip or
a scene. Producer Pal isn't only an editor. A lot of what makes it useful is
_"play that back,"_ _"launch the chorus,"_ _"loop bars 5–8."_ All of that needs
transport control the SDK doesn't currently offer.

### It can only see part of the Live Set

The SDK exposes a curated, hand-picked set of properties. Producer Pal reads a
good deal more to do its job: whether a track can be armed, whether it's a
group, its monitoring state, which clip is currently playing, time signatures,
and much more. And there's no "escape hatch" to read or set anything outside
that curated set, so the gaps are hard to work around.

### It can't reliably keep track of which clip is which

This one is subtle but important. When Producer Pal tells the AI "here's clip
#42," the AI may refer back to that same clip many steps later, after you've
dragged clips around, added tracks, or reorganized your set. Producer Pal leans
on Live giving each object a **stable name tag** that stays attached to it no
matter where it moves.

The Extensions SDK works differently. Its references are more like **seat
numbers in a theater that get reshuffled every time someone stands up**: the
moment a clip or track moves, its reference changes, and the old one may now
point at something else. For a quick one-shot menu command that's no problem.
For an AI holding a mental map of your whole project across a conversation, it
becomes an ongoing source of "wait, which clip did you mean?" mix-ups.

### It can't browse your sample folders

An extension _can_ import a specific file from any path — the host does that on
its behalf and copies the file into the project. What it can't do is **find**
files on its own: its code is confined to its private storage and a temp folder,
with no way to list or scan your Documents, your sample library, or anywhere
else (and Ableton has said today's permission model will harden into a stricter
sandbox). There isn't even a native file picker — selecting a file would mean
building one yourself in a webview. So the AI couldn't browse your library and
pick the right loop; at best you'd point it at specific files by hand. Producer
Pal instead scans and reads your sample folders directly, wherever they live,
and references files in place rather than copying them in.

## What the SDK _can_ do that Max for Live can't, and how I weigh it

To be fair, the SDK does add a few things a normal Max for Live device can't.
Here's how I weigh each one:

| The SDK adds…                        | How I weigh it                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Import a file into the project**   | Producer Pal can already create clips from any audio file on disk. "Copy it into the project folder" is a nice convenience, not a new ability.                  |
| **Render an audio region to a file** | Producer Pal already has the sample file for any audio clip. The only extra is bouncing an arbitrary time range, which is handy occasionally but rarely needed. |
| **Native pop-up dialogs & menus**    | These are built around a person clicking through Live's interface. Producer Pal is driven by conversation, so they don't quite fit.                             |
| **Grouped undo**                     | A genuinely nice touch (undo a big change in one step), but on its own not enough to outweigh everything above.                                                 |

### The thing people most hope for, and the SDK can't do it yet

The capability that _would_ be genuinely exciting is **turning a MIDI instrument
into audio**: resampling a synth, freezing a drum rack, bouncing a part to a
sample.

Right now the SDK can't. Its one rendering command works only on **audio
tracks**, and only captures the sound _before_ the track's effects. There's no
way to render a MIDI instrument, and no freeze, flatten, or bounce. (I checked
this directly against the SDK's code.) So the most compelling reason to reach
for an extension isn't there yet.

## "But couldn't Producer Pal use both?"

It's a good question, and it deserves a real answer.

In theory, yes. You could run an extension _and_ keep a Max for Live device for
everything the extension can't do. When I was weighing this, I looked at how
other people building AI tools for Live had approached it. They run into the
same walls, and to get real work done each one ends up bolting a **Max for Live
device** alongside the extension, reading the saved project file offline, or
simply going without. On its own, the extension acts as a messenger; a Max for
Live device (or nothing) does the actual work.

You can see this in their code too, not just take my word for it. One project's
source notes that transport is _"not supported by [the] Ableton Extension API…
no transport/view API yet,"_ and returns empty values for playback and time
signature. Another describes its object references as _"ephemeral… so the agent
never holds them across turns,"_ which is the same seat-renumbering issue in
their own words. A couple of them even started from a Max for Live bridge and
gave up capabilities when they moved to the SDK.

Which is really the heart of it: Producer Pal **is already that Max for Live
device**, and Max for Live already does what the extension can't: playback, the
full Live Set, stable references, your sample folders. Adding an extension on
top wouldn't unlock anything new; it would just be a second thing to install,
with the more limited piece out front.
([Curious how that works? Here's the hood open. →](/how-it-works/running-inside-live))

## "Wouldn't an extension reach more people?"

It's the most tempting reason to want one: surely an extension, with no Max for
Live needed, would let _everyone_ on Live run Producer Pal? I assumed the same
thing, until I checked. Per
[Ableton's own FAQ](https://www.ableton.com/live/extensions/), extensions
require **Live Suite** and are "not available in Live Standard, Intro, or Lite."

That's the same audience that can already run Max for Live, if not _narrower_:
Max for Live comes with Suite, but it can also be added to **Live Standard** as
a paid add-on, so today's Producer Pal can in theory reach a few people an
extension couldn't. So an extension wouldn't widen who can use Producer Pal,
which removes the one upside that might have offset everything above.

## What would change my mind

The SDK is improving quickly, and I'm genuinely glad it exists. I'd happily
build on it the day it can:

1. **Render a MIDI instrument to audio** (resample / freeze / bounce), the piece
   that would make an audio add-on worth it.
2. **Keep stable references to objects** that survive moving and rearranging a
   set, which is what an AI needs to reason across a whole project.

Until at least the first of those arrives, an extension would give you less than
Producer Pal already does, so it's not a step I'd want to take yet. I'm watching
closely, and I'll update this page when things change.

## Found something I missed?

Genuinely possible: the SDK is new and moving fast, and I'd be glad to be wrong.
If you've spotted a capability I've overlooked, I'd love to see it.
[Ableton's Extensions page](https://www.ableton.com/live/extensions/) is a great
reference to point to, and you can start a
[GitHub Discussion](https://github.com/adamjmurray/producer-pal/discussions) or
say hello on [Discord](https://discord.gg/rmU3DSzgwH). I read every message, and
I update my thinking when the facts change.
