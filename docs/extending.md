---
title: Extending Producer Pal
description:
  Build on Producer Pal — script Ableton Live over the REST API with or without
  AI, drive it from coding agents with an Agent Skill, customize the skills and
  context the AI receives, or add capabilities with a companion MCP server.
---

# Extending Producer Pal

Producer Pal is a stable core with open edges. The core does one thing: control
Ableton Live, with the fewest tools and tokens it can manage. Everything around
that — how the AI is instructed, what interface you drive it from, whether
there's an AI involved at all — is yours to change.

None of it requires forking the repo or modifying the core.

## Script Live over the REST API

The [REST API](/guide/rest-api) exposes every tool the AI can use over plain
HTTP, on your own machine. It's the most open extension point, and the one
that's easiest to overlook: **there is no AI in this path unless you put one
there.**

```bash
# Read the Live Set overview
curl -X POST http://localhost:3350/api/tools/ppal-read-live-set \
  -H 'Content-Type: application/json' -d '{}'

# Set the tempo to 128
curl -X POST http://localhost:3350/api/tools/ppal-update-live-set \
  -H 'Content-Type: application/json' -d '{"tempo": 128}'
```

That opens up several things:

- **Build your own interface.** A web page, a phone remote, a hardware
  controller mapping, a Max patch, a Stream Deck button — anything that can make
  an HTTP request can drive Ableton Live.
- **Use Producer Pal without AI.** Generative scripts, batch edits across many
  clips, project scaffolding, reproducible test Sets. If you'd rather write a
  Euclidean rhythm generator in Python than ask an LLM for one, the API is right
  there.
- **Put your own AI in front of it.** The API is model-agnostic. Wire it to
  whatever you like — an agent framework, a local model, a notebook.

The [`ppal-live-api`](/features#ppal-live-api) tool goes a level lower, giving
direct access to the [Live Object Model](https://docs.cycling74.com/apiref/lom/)
for reads and writes the specialized tools don't cover. It's off by default —
see [Live API](/guide/rest-api#live-api).

Zero-dependency [Node and Python sample scripts](/guide/rest-api#sample-scripts)
are included as starting points.

## Drive it from a coding agent

Producer Pal ships a portable [Agent Skill](/guide/skills) — the `SKILL.md`
convention shared by Claude Code, Codex CLI, and Gemini CLI. Drop the folder
into your agent's skills directory and it can control Ableton Live through the
REST API, with no MCP client involved.

This is a genuinely different way to work. A coding agent can write and run code
against the API, iterate on a generative script while you listen to the result,
and change device settings mid-session — [notation](/features/midi-notation),
[small model mode](/features#small-model-mode),
[Direct Live API](/features#ppal-live-api) — that MCP clients can only change by
editing the device and starting a new conversation.

[Set up the Agent Skill →](/guide/skills)

## Customize what the AI is told

Shape how the AI uses Producer Pal's tools — no code, just text. All of it lives
in `~/.producer-pal/` as plain Markdown you can edit, back up, and share, and
all of it is editable in the
[context editor](/guide/context#the-context-editor).

- **[Skills](/guide/customizing-skills)** — the instructions the AI receives
  when it connects. Override any fragment with your own text, or delete the
  parts you never use so you stop paying for them on every conversation. A
  fragment can also `@include` your own Markdown files, which is how you add
  guidance the built-ins don't cover.
- **[Global context](/guide/context#global)** — what you always want, in every
  Live Set: your genres, your habits, your rules.
- **[Memory](/guide/context#memory)** — facts the AI records about you as you
  work, loaded on demand so a growing memory stays cheap.
- **[Custom instructions](/guide/context#instructions)** — the system prompt for
  the built-in [Chat UI](/guide/chat-ui). (External clients bring their own.)

**Who it's for:** anyone who can write clear instructions. If you can describe a
production workflow in plain language, you can change how the AI works.

## Add capabilities with a companion MCP server

Producer Pal controls Ableton Live. It doesn't analyze audio, generate Markov
chains, or talk to your hardware — and it doesn't need to. An MCP client can
connect to several servers at once, and the AI combines their tools naturally.
Your server's tools work alongside Producer Pal's with no integration work on
either side.

Things worth building this way:

- Audio analysis and feature extraction
- Generative algorithms (Euclidean rhythms, Markov chains, L-systems)
- Sample management and tagging
- Hardware controller integration
- Bridges to other DAWs and tools

A companion server can be written in any language with any MCP SDK — it just has
to provide tools. If it needs to reach into Live itself, it can call Producer
Pal's [REST API](/guide/rest-api) instead of rebuilding the bridge.

**Who it's for:** developers comfortable with MCP server development.

## Choosing the right extension point

| I want to…                                      | Use                                          |
| ----------------------------------------------- | -------------------------------------------- |
| Script Ableton Live without AI                  | [REST API](/guide/rest-api)                  |
| Build my own interface for Live                 | [REST API](/guide/rest-api)                  |
| Work from Claude Code, Codex CLI, or Gemini CLI | [Agent Skill](/guide/skills)                 |
| Teach the AI a production technique             | [Skills](/guide/customizing-skills)          |
| Tell the AI my preferences once, for good       | [Global context](/guide/context#global)      |
| Cut what the AI costs per conversation          | [Trim the skills](/guide/customizing-skills) |
| Add something the Live API can't do             | Companion MCP server                         |

## Ideas under consideration

Not commitments — the direction being explored after 2.0:

- **Custom skills as first-class.** Today you extend the skills by overriding a
  fragment and `@include`-ing your own files. Registering a standalone skill —
  named, described, and loaded when it's relevant — is a natural next step.
- **Tool description overrides and presets.** Tune how the AI reads a specific
  tool, or curate a smaller tool set for a focused task.
- **Workflows, or subagents, or neither.** The original idea was "workflows":
  fixed tool-call sequences the AI triggers but doesn't improvise. The open
  question is whether that's really just a command-oriented skill — and whether
  the more useful version is defining subagents instead. Undecided.

Have an opinion on any of these? That's exactly what
[GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions)
and [Discord](https://discord.gg/rmU3DSzgwH) are for.

## A stable core is the point

The core repo won't change much after 2.0, and that's deliberate. Extensions
don't break when the core doesn't move.

Starting with 2.0, breaking changes require at least a minor version bump (2.1,
3.0) — patch releases stay backward-compatible. Core work continues on bug
fixes, new Live API features as they land, and efficiency — costs matter whether
you're on a local model, a subscription quota, or pay-as-you-go — but through
targeted improvements, not overhauls.

Innovation happens at the edges: people sharing skills, developers building
companion servers, and interfaces nobody has thought of yet. The core isn't the
bottleneck.

## Contributing back

If you find tweaks to the default skills or tool and parameter descriptions that
improve how the AI behaves, those can be adopted into the core via pull request
— improvements to the built-ins reach everyone.

Want to discuss ideas for extensions? Join the conversation on
[GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions) or
[Discord](https://discord.gg/rmU3DSzgwH).
