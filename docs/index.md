---
layout: home
title: Producer Pal — Ableton MCP for AI music production
titleTemplate: false
description:
  The open Ableton MCP server and REST API. Bring any AI to Ableton Live —
  Claude, Gemini, ChatGPT, Ollama — or script Live with no AI at all. Free and
  open-source.

hero:
  name: Producer Pal™
  text: Control Ableton Live with words
  tagline:
    The open Ableton MCP server and REST API. Bring any AI — Claude, Gemini,
    ChatGPT, Ollama — or script Live with no AI at all. Free and open-source.
  image:
    src: /producer-pal-logo-animated.svg
    alt: Producer Pal
  actions:
    - theme: brand
      text: Download for Ableton Live
      link: https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd
    - theme: alt
      text: Installation Guide
      link: /installation
    - theme: alt
      text: User Guide
      link: /guide

features:
  - title: Just Say What You Want
    details: >
      Manage tracks, edit MIDI and audio clips, tweak instruments and effects,
      and build arrangements. Do tedious edits in seconds and explore ideas
      quickly.
    link: /features
    linkText: See all features

  - title: Bring Your Own AI — or None
    details: >
      Use cloud AI (Claude, Gemini, ChatGPT), run free and private with local
      models (Ollama, Bionic), or skip AI entirely and script Live through the
      open REST API. No lock-in.
    link: /installation
    linkText: Setup guide

  - title: Open Source & Free Forever
    details: >
      Built on shared knowledge, shared back to all of us. No subscriptions, no
      paywalls, no premium tiers. GPL-3.0 licensed and developed completely in
      the open.
    link: https://github.com/adamjmurray/producer-pal
    linkText: View on GitHub
---

<div class="download-band">
  <h2 class="download-title">Get Producer Pal</h2>
  <p class="download-subtitle">The Max for Live device is all you need to start — drop it onto a track in Ableton Live and it links you to the docs and the chat UI.</p>
  <div class="download-actions">
    <a class="download-btn download-btn-primary" href="https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd">
      <span class="download-btn-label">Download Max for Live Device</span>
      <span class="download-btn-sub">Producer_Pal.amxd · v{{ $frontmatter.version }}</span>
    </a>
    <a class="download-btn" href="https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb">
      <span class="download-btn-label">Claude Desktop Extension</span>
      <span class="download-btn-sub">Producer_Pal.mcpb</span>
    </a>
    <a class="download-btn" href="https://www.npmjs.com/package/producer-pal" target="_blank" rel="noreferrer">
      <span class="download-btn-label">npx producer-pal</span>
      <span class="download-btn-sub">npm — for any MCP client</span>
    </a>
  </div>
  <p class="download-next">Then choose how you want to use it below, or follow the <a href="/installation">full Installation Guide</a>.</p>
</div>

<div class="get-started-wrapper">
  <section class="get-started-container">
    <h2 class="get-started-title">Get Started Now</h2>
    <p class="get-started-subtitle">Choose your setup:</p>
    <div class="get-started-arrows">
      <svg viewBox="0 0 600 80" preserveAspectRatio="xMidYMid meet">
        <path class="arrow-path" d="M300,10 Q180,45 80,70" />
        <path class="arrow-path" d="M300,10 L300,70" />
        <path class="arrow-path" d="M300,10 Q420,45 520,70" />
      </svg>
    </div>
    <div class="get-started-cards">
      <div class="get-started-card card-primary">
        <div class="card-header">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h3 class="card-title"><a href="/installation/desktop-apps">Desktop Apps</a></h3>
        </div>
        <p class="card-description">Dedicated AI apps</p>
        <ul class="card-links">
          <li><a href="/installation/claude-desktop">Claude Desktop</a> <span class="tag">easiest</span></li>
          <li><a href="/installation/chatgpt-app">ChatGPT App (OpenAI)</a></li>
          <li><a href="/installation/antigravity">Antigravity (Google)</a></li>
          <li><a href="/installation/bionic">Bionic (LM Studio)</a> <span class="tag">offline</span></li>
        </ul>
      </div>
      <div class="get-started-card card-secondary">
        <div class="card-header">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 class="card-title"><a href="/installation/chat-ui">Built-in Chat UI</a></h3>
        </div>
        <p class="card-description">Browser-based chat</p>
        <ul class="card-links">
          <li><a href="/installation/ollama">Ollama</a> <span class="tag">offline</span></li>
          <li><a href="/installation/chat-ui-other-providers#openrouter">OpenRouter</a></li>
          <li><a href="/installation/gemini">Gemini</a></li>
          <li><a href="/installation/chat-ui-other-providers">Mistral, etc.</a></li>
        </ul>
      </div>
      <div class="get-started-card card-tertiary">
        <div class="card-header">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <h3 class="card-title"><a href="/extending">Agents &amp; Code</a></h3>
        </div>
        <p class="card-description">Coding agents and your own code</p>
        <ul class="card-links">
          <li><a href="/guide/skills">Agent Skill</a> <span class="tag">no MCP</span></li>
          <li><a href="/guide/rest-api">REST API</a> <span class="tag">no AI</span></li>
          <li><a href="/installation/cli">Command Line Tools</a></li>
          <li><a href="/installation">Web apps &amp; more</a></li>
        </ul>
      </div>
    </div>
  </section>
</div>

## Demos

<div class="demo-grid">
  <div>
    <p class="demo-video-label">Ableton Live Project Management with Producer Pal</p>
    <div class="demo-video">
      <iframe
        src="https://www.youtube.com/embed/_pB3qESiIhw?si=6vrojGs5YENHtHDS"
        title="Ableton Live Project Management with Producer Pal"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen>
      </iframe>
    </div>
  </div>
  <div>
    <p class="demo-video-label">Claude Desktop vs Ableton Live in 2026</p>
    <div class="demo-video">
      <iframe
        src="https://www.youtube.com/embed/_p6Qll5Mqcs"
        title="Claude Desktop vs Ableton Live in 2026"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen>
      </iframe>
    </div>
  </div>
  <div>
    <p class="demo-video-label">Transforming MIDI with AI in Ableton via Producer Pal</p>
    <div class="demo-video">
      <iframe
        src="https://www.youtube.com/embed/2T_w5Roe6jY"
        title="Transforming MIDI with AI in Ableton via Producer Pal"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen>
      </iframe>
    </div>
  </div>
  <div>
    <p class="demo-video-label">Talking to Ableton Live with AI (via OpenAI Realtime 2)</p>
    <div class="demo-video">
      <iframe
        src="https://www.youtube.com/embed/iz2dyftiSFU"
        title="Talking to Ableton Live with AI (via OpenAI Realtime 2)"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen>
      </iframe>
    </div>
  </div>
</div>

**More helpful videos:**

- [How to setup Producer Pal with Gemini](https://www.youtube.com/watch?v=A_NXOtnR57M&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX)
  ([written guide](/installation/gemini)) — _Note: free tier now has strict
  limits_
- [How to setup Producer Pal with Gemini CLI](https://www.youtube.com/watch?v=jd3wTdDqd4Y&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX)
  (for command line users) — _Note: free tier now has strict limits_

## About Producer Pal

Producer Pal is an **Ableton MCP** (Model Context Protocol) server packaged as a
Max for Live device. It's the most flexible way to use **AI for Ableton Live** —
connect your favorite AI assistant, describe what you want in plain language,
and Producer Pal translates that into real edits in your Live Set: creating
tracks, writing MIDI and audio clips, tweaking instruments and effects, and
building arrangements.

It works with any MCP-compatible AI, including Claude, Gemini, ChatGPT, Mistral,
and local models via Ollama or LM Studio Bionic. And the AI is optional: the
same device exposes an open [REST API](/guide/rest-api), so anything that can
make an HTTP request — scripts, coding agents, your own tools — can read and
edit a Live Set with no AI in the loop. A portable [Agent Skill](/guide/skills)
that drops into Claude Code, Codex CLI, Gemini CLI, and any SKILL.md-compatible
runtime rounds out three integration paths from one Max for Live device.

Producer Pal is free, open-source (GPL-3.0), and actively developed in the open
with regular updates for the latest Ableton Live features.

## Support

Join the [Discord community](https://discord.gg/rmU3DSzgwH) to ask questions,
share tips, and connect with other users. For bug reports, troubleshooting, and
more, visit the [Support page](/support).
