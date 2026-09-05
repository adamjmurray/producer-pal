---
title: How Producer Pal Runs Inside Ableton Live
description:
  Producer Pal runs a modern JavaScript server inside Ableton Live through Max
  for Live, bridged to Live's full API, giving real npm-powered Node.js plus
  complete, real-time control of your Live Set in one device.
---

# How Producer Pal Runs Inside Ableton Live

Ableton's new **Extensions SDK** is not the only modern way to run JavaScript
inside Live. Producer Pal has been running a full JavaScript server inside Live,
with real-time control of your Live Set, via Max for Live. That's also why it
can do [things an extension can't do yet](/how-it-works/why-not-an-extension).

## Two engines, two halves of the job

Max for Live has shipped with Live for over a decade. Inside it are two very
different JavaScript engines, and each has something the other lacks:

- **The Live API engine.** This is the part that can actually _touch_ your Live
  Set: start and stop playback, launch clips and scenes, read and write nearly
  any property of any track, clip, or device, and refer to each object by a
  **stable ID** that follows it even as you move things around. It's real-time
  and far deeper than the Extensions SDK, though not every operation is possible
  (see [More Than a Wrapper](/how-it-works/more-than-a-wrapper) for the edge
  cases). What it _can't_ do is run a modern server, install libraries, or talk
  to an AI on the internet.

- **A modern Node.js runtime.** This is full-fat **Node.js** running inside
  Live: real web servers, the entire **npm** library ecosystem, network access,
  the works. This is the "real JavaScript" people think only an extension can
  offer. What it _can't_ do, on its own, is reach into your Live Set; it has no
  direct access to the Live API.

Neither is enough on its own.

## The bridge

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
Live API engine, which carries it out in your Live Set in real time, then
reports back.

Getting the two engines to talk to each other reliably is the fiddly part, and
it's why you don't see this approach often. For how the bridge actually moves
data (JSON sent over Max patch cables, chunked to survive a length limit), see
[The Bridge: JSON Over Patch Cables](/how-it-works/the-bridge).

## One device, nothing to wire up

Everything lives in a single Max for Live device. Drop it onto a track and the
whole bridge comes up with it: server, Live API access, and all. No separate
processes to launch, no second component to install and connect, no juggling an
extension and a helper device.
