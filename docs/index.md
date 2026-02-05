---
layout: home

hero:
  name: Producer Pal
  text: Control Ableton Live with words
  tagline:
    AI-powered assistant for music production. Works with Claude, Gemini,
    ChatGPT, Ollama, and more.
  image:
    src: /producer-pal-logo.svg
    alt: Producer Pal
  actions:
    - theme: brand
      text: Installation
      link: /installation
    - theme: alt
      text: User Guide
      link: /guide

features:
  - title: Describe, Don't Click
    details: >
      Manage tracks and scenes, edit MIDI and audio clips, add and tweak
      instruments and effects, and build arrangements through conversation.

  - title: Complex Edits Made Simple
    details: >
      Do tedious edits in seconds: transpose patterns, fade velocities, shift
      notes, randomize timing. Explore your ideas quickly.

  - title: Works Online or Offline
    details:
      Use cloud AI services (Claude, Gemini, GPT) or run completely offline with
      local models (Ollama, LM Studio). Includes a built-in chat UI to get
      started quickly.

  - title: Open Source & Free Forever
    details:
      AGPL-3.0 licensed and developed completely in the open. No subscriptions,
      no paywalls, no premium features.
---

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
          <li><a href="/installation/lm-studio">LM Studio</a> <span class="tag">offline</span></li>
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
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </div>
          <h3 class="card-title"><a href="/installation">More Options</a></h3>
        </div>
        <p class="card-description">Other ways to connect</p>
        <ul class="card-links">
          <li><a href="/installation/cli">Command Line Tools</a></li>
          <li><a href="/installation/web-apps">Web Apps</a></li>
          <li><a href="/installation/other-mcp">Other LLMs</a></li>
        </ul>
      </div>
    </div>
  </section>
</div>

## Demo

Watch the Producer Pal walk-through video with Claude Desktop:

<div style="position: relative; padding-bottom: 56.25%; height: 0; margin: 2em 0;">
  <iframe
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
    src="https://www.youtube.com/embed/IB19LqTZQDU?list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX&t=202s"
    title="Producer Pal demo video"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
  </iframe>
</div>

**Video Chapters:**

- [0:00 - Installation with Claude Desktop](https://www.youtube.com/watch?v=IB19LqTZQDU&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX)
- [2:29 - Connecting the AI to Ableton](https://www.youtube.com/watch?v=IB19LqTZQDU&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX&t=149s)
- [3:23 - Generating a 4-part, 8-bar loop from scratch](https://www.youtube.com/watch?v=IB19LqTZQDU&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX&t=202s)

**More helpful videos:**

- [How to setup Producer Pal with Gemini](https://www.youtube.com/watch?v=A_NXOtnR57M&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX)
  ([written guide](/installation/gemini)) — _Note: free tier now has strict
  limits_
- [How to setup Producer Pal with Gemini CLI](https://www.youtube.com/watch?v=jd3wTdDqd4Y&list=PLFqWfbwGKmqenUb1DUFZ5ECYU6klUWNtX)
  (for command line users) — _Note: free tier now has strict limits_

## Support

- **Feedback, Feature Ideas, General Discussion**:
  [GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions)
- **Bugs & Problems**: Report in
  [the bug reports forum](https://github.com/adamjmurray/producer-pal/discussions/categories/bug-reports)
  or [issues list](https://github.com/adamjmurray/producer-pal/issues)

## Data Privacy

When using online AI services, your musical data (MIDI notes, track names,
tempo, etc.) is sent to that service for processing. Most services offer options
to opt out of training on your data. Check your AI provider's privacy policy and
account settings. Avoid online services for highly confidential or commercially
sensitive work.

## Get Involved

To support Producer Pal development, ⭐️ star
[the GitHub repository](https://github.com/adamjmurray/producer-pal) to help
others discover the project.

Want to help? Join the
[discussion on GitHub](https://github.com/adamjmurray/producer-pal/discussions)
or
[contribute directly](https://github.com/adamjmurray/producer-pal/blob/main/DEVELOPERS.md).
