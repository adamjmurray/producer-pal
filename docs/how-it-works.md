---
title: How It Works
description:
  How Producer Pal runs a full Node.js server and complete Live API control
  together inside a single Max for Live device, the bridge that connects them,
  and what it adds on top of the Live API.
---

# How It Works

From the outside, Producer Pal is one device you drop onto a track. Underneath,
it runs a **full Node.js server** and **real-time control of Ableton Live**
together inside that single Max for Live device.

- **[Running Inside Ableton Live](/how-it-works/running-inside-live)**: the big
  picture. A modern Node.js runtime and Live's full API, fused into one device,
  and why an AI music assistant needs both.

- **[The Bridge: JSON Over Patch Cables](/how-it-works/the-bridge)**: how the
  Node.js server and the Live API engine talk to each other, including the
  chunking scheme for oversized messages and how warnings get captured on the
  way back.

- **[More Than a Live API Wrapper](/how-it-works/more-than-a-wrapper)**: the
  refinements that give the AI a workable interface, and the workarounds that
  add capabilities the Live API doesn't offer at all, including a property Live
  never documented.

- **[Why Not an Ableton Extension?](/how-it-works/why-not-an-extension)**: how
  this compares to Ableton's Extensions SDK, and what Producer Pal can do today
  that an extension can't.
