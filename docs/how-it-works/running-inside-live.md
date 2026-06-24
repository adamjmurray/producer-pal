---
title: How Producer Pal Runs Inside Ableton Live
description:
  Producer Pal runs a modern JavaScript server inside Ableton Live through Max
  for Live, bridged to Live's full API, giving real npm-powered Node.js plus
  complete, real-time control of your Live Set in one device.
---

# How Producer Pal Runs Inside Ableton Live

It's easy to assume Ableton's new **Extensions SDK** is the only modern way to
run JavaScript inside Live, and to wonder whether Producer Pal is built on
something older. It's actually the other way around: Producer Pal already runs a
full, modern JavaScript server inside Live, with **complete** control of your
Live Set, through a path most people don't realize is there.

This page opens the hood and explains that path in plain terms. It's also why
Producer Pal can do things an
[extension can't do yet](/how-it-works/why-not-an-extension).

## Two superpowers that usually live apart

For over a decade, Ableton Live has shipped with **Max for Live**, a way to run
custom devices and code right inside Live. Within Max for Live there are two
very different engines, and each has a superpower the other lacks:

- **The Live API engine.** This is the part that can actually _touch_ your Live
  Set: start and stop playback, launch clips and scenes, read and write **any**
  property of any track, clip, or device, and refer to each object by a **stable
  ID** that follows it even as you move things around. It is complete and
  real-time. What it _can't_ do is run a modern server, install libraries, or
  talk to an AI on the internet.

- **A modern Node.js runtime.** This is full-fat **Node.js** running inside
  Live: real web servers, the entire **npm** library ecosystem, network access,
  the works. This is the "real JavaScript" people think only an extension can
  offer. What it _can't_ do, on its own, is reach into your Live Set; it has no
  direct access to the Live API.

One can control Live but not reach the modern world. The other lives in the
modern world but can't control Live. Apart, neither is enough to power an AI
music assistant.

## The bridge is the trick

Producer Pal's core is a **bridge that makes these two engines work as one**,
inside a single Max for Live device:

<!-- prettier-ignore -->
<div style="max-width: 560px; margin: 1.5rem auto;">
  <svg viewBox="0 0 600 400" width="100%" role="img" aria-labelledby="bridge-title bridge-desc" xmlns="http://www.w3.org/2000/svg" style="font-family: var(--vp-font-family-base);">
    <title id="bridge-title">How Producer Pal connects an AI to Ableton Live</title>
    <desc id="bridge-desc">An AI connects over the Model Context Protocol to the Producer Pal device, which contains a Node.js server bridged to the Live API, which controls your Ableton Live Set.</desc>
    <defs>
      <marker id="bd-arrow" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L7,3 L0,6 Z" style="fill: var(--vp-c-text-2);" />
      </marker>
    </defs>
    <text x="300" y="24" text-anchor="middle" style="fill: var(--vp-c-text-1); font-size: 15px; font-weight: 600;">AI: Claude, Gemini, ChatGPT, local models…</text>
    <line x1="300" y1="36" x2="300" y2="92" style="stroke: var(--vp-c-text-2); stroke-width: 1.5;" marker-end="url(#bd-arrow)" />
    <text x="312" y="68" text-anchor="start" style="fill: var(--vp-c-text-2); font-size: 13px; font-style: italic;">Model Context Protocol</text>
    <rect x="40" y="100" width="520" height="180" rx="12" style="fill: var(--vp-c-bg-soft); stroke: var(--vp-c-brand-1); stroke-width: 2;" />
    <text x="300" y="128" text-anchor="middle" style="fill: var(--vp-c-text-1); font-size: 15px; font-weight: 600;">Producer Pal device</text>
    <rect x="72" y="152" width="156" height="92" rx="8" style="fill: var(--vp-c-bg); stroke: var(--vp-c-divider); stroke-width: 1.5;" />
    <text x="150" y="190" text-anchor="middle" style="fill: var(--vp-c-text-1); font-size: 14px;">Node.js server</text>
    <text x="150" y="212" text-anchor="middle" style="fill: var(--vp-c-text-2); font-size: 12px;">npm · network</text>
    <rect x="258" y="152" width="84" height="92" rx="8" style="fill: var(--vp-c-bg); stroke: var(--vp-c-divider); stroke-width: 1.5;" />
    <text x="300" y="203" text-anchor="middle" style="fill: var(--vp-c-text-1); font-size: 14px;">bridge</text>
    <rect x="372" y="152" width="156" height="92" rx="8" style="fill: var(--vp-c-bg); stroke: var(--vp-c-divider); stroke-width: 1.5;" />
    <text x="450" y="190" text-anchor="middle" style="fill: var(--vp-c-text-1); font-size: 14px;">Live API</text>
    <text x="450" y="212" text-anchor="middle" style="fill: var(--vp-c-text-2); font-size: 12px;">full control</text>
    <text x="243" y="205" text-anchor="middle" style="fill: var(--vp-c-text-2); font-size: 20px;">⇄</text>
    <text x="357" y="205" text-anchor="middle" style="fill: var(--vp-c-text-2); font-size: 20px;">⇄</text>
    <line x1="300" y1="280" x2="300" y2="336" style="stroke: var(--vp-c-text-2); stroke-width: 1.5;" marker-end="url(#bd-arrow)" />
    <rect x="176" y="346" width="248" height="42" rx="8" style="fill: var(--vp-c-bg-soft); stroke: var(--vp-c-divider); stroke-width: 1.5;" />
    <text x="300" y="372" text-anchor="middle" style="fill: var(--vp-c-text-1); font-size: 15px; font-weight: 600;">Your Ableton Live Set</text>
  </svg>
</div>

The AI connects to the Node.js server. When it asks to, say, _"add a four-bar
bassline and play it back,"_ the server hands that work across the bridge to the
Live API engine, which carries it out in your actual Live Set in real time, then
reports back. You get the modern, connected, npm-powered world **and** full
real-time control of Live, fused into one tool.

Getting these two engines to talk to each other reliably is the fiddly part, and
it's why you don't see this approach often. It took a lot of time in Max, Max
for Live, and the Live API to get right. But once it's there, the payoff is
exactly the combination an AI assistant needs.

## How this compares to an extension

An Ableton extension gives you the modern-Node.js half of the picture. What it
doesn't have today is the rest: it can't start playback, can't launch clips,
sees only part of the Live Set, can't keep a stable reference to a clip once you
move it, and works inside a sandbox away from your sample folders. (The details,
and how I weigh them, are in
[Why isn't Producer Pal an extension?](/how-it-works/why-not-an-extension).)

Producer Pal's bridge gives you **both halves at once**:

| Capability                               | Producer Pal (Max for Live + bridge) | Ableton extension |
| ---------------------------------------- | :----------------------------------: | :---------------: |
| Modern Node.js + npm + network           |                  ✅                  |        ✅         |
| Start/stop playback, launch clips/scenes |                  ✅                  |        ❌         |
| Read & write the **full** Live Set       |                  ✅                  |   partial only    |
| Stable references that survive edits     |                  ✅                  |        ❌         |
| Reach your sample folders anywhere       |                  ✅                  |   sandboxed out   |
| Runs on stable Live releases today       |                  ✅                  |     beta only     |

That last row matters too: Producer Pal works on
[shipping versions of Ableton Live](/installation), while the Extensions SDK is
still a beta available only in pre-release builds.

## One device, nothing extra to wire up

Because everything lives in a single Max for Live device, there's nothing for
you to assemble. You drop **one** device onto a track and the whole bridge comes
up with it: server, Live API access, and all. No separate processes to launch,
no second component to install and connect, no juggling an extension and a
helper device. That simplicity is a direct result of solving the bridge once,
properly.

If you'd like to add capabilities Live itself can't provide (custom audio
analysis, generative algorithms, your own sample tooling), the right path is a
[companion MCP server](/extending), which the AI uses right alongside Producer
Pal. The stable core stays simple; the new ideas live at the edges.
