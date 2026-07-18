---
title: Extending Producer Pal
description:
  Build on Producer Pal — script Ableton Live over the REST API with or without
  AI, drive it from coding agents with an Agent Skill, customize the skills and
  context the AI receives, or add capabilities with a companion MCP server.
---

# Extending Producer Pal

Producer Pal is a stable core with open edges. The core does one thing: control
Ableton Live, with the fewest tools and tokens it can manage.

Everything else is up to you: how the AI is instructed, what you drive it from,
and whether there's an AI involved at all. You don't need to fork the repo or
change the core to do any of it.

## Script Live over the REST API

The [REST API](/guide/rest-api) exposes every tool over plain HTTP on your own
machine. There's no AI in this path unless you add one.

```bash
# Read the Live Set overview
curl -X POST http://localhost:3350/api/tools/ppal-read-live-set \
  -H 'Content-Type: application/json' -d '{}'

# Set the tempo to 128
curl -X POST http://localhost:3350/api/tools/ppal-update-live-set \
  -H 'Content-Type: application/json' -d '{"tempo": 128}'
```

You can:

- **Build your own interface.** A web page, a phone remote, a hardware
  controller, a Max patch, a Stream Deck button — anything that can make an HTTP
  request can drive Live.
- **Use it without AI at all.** Generative scripts, batch edits across many
  clips, project scaffolding, reproducible test Sets.
- **Put your own AI in front of it.** The API doesn't care which model. Use an
  agent framework, a local model, a notebook, whatever fits.

The [`ppal-live-api`](/features#ppal-live-api) tool goes lower, with direct
access to the [Live Object Model](https://docs.cycling74.com/apiref/lom/) for
reads and writes the specialized tools don't cover. It's off by default — see
[Live API](/guide/rest-api#live-api).

Zero-dependency [Node and Python sample scripts](/guide/rest-api#sample-scripts)
are included to get you started.

## Drive it from a coding agent

Producer Pal ships a portable [Agent Skill](/guide/skills) — the `SKILL.md`
convention shared by Claude Code, Codex CLI, and Gemini CLI. Drop the folder
into your agent's skills directory and it can control Live through the REST API,
no MCP client needed.

A coding agent can write and run code against the API, iterate on a generative
script while you listen, and change device settings mid-session:
[notation](/features/midi-notation),
[small model mode](/features#small-model-mode),
[Direct Live API](/features#ppal-live-api). MCP clients can only change those by
editing the device and starting a new conversation.

[Set up the Agent Skill →](/guide/skills)

## Customize what the AI is told

Shape how the AI uses the tools with text, not code. It all lives in
`~/.producer-pal/` as plain Markdown you can edit, back up, and share, and you
can edit it in the [context editor](/guide/context#the-context-editor).

- **[Skills](/guide/customizing-skills)** — the instructions the AI gets when it
  connects. Override any fragment with your own text, or delete the parts you
  don't use so you stop paying for them every conversation. A fragment can also
  `@include` your own Markdown files, to add guidance the built-ins don't cover.
- **[Global context](/guide/context#global)** — what you want in every Live Set:
  your genres, your habits, your rules.
- **[Memory](/guide/context#memory)** — facts the AI records about you as you
  work, loaded on demand so a growing memory stays cheap.
- **[Custom instructions](/guide/context#instructions)** — the system prompt for
  the built-in [Chat UI](/guide/chat-ui). (External clients bring their own.)

**Who it's for:** anyone who can write clear instructions. If you can describe a
workflow in plain language, you can change how the AI works.

## Add capabilities with a companion MCP server

Producer Pal controls Ableton Live. It doesn't analyze audio, generate Markov
chains, or talk to your hardware, and it doesn't need to. An MCP client can
connect to several servers at once, and the AI uses their tools together. Your
server's tools work alongside Producer Pal's with no integration work on either
side.

Good candidates:

- Audio analysis and feature extraction
- Generative algorithms (Euclidean rhythms, Markov chains, L-systems)
- Sample management and tagging
- Hardware controller integration
- Bridges to other DAWs and tools

Write it in any language with any MCP SDK — it just has to provide tools. If it
needs to reach into Live, it can call Producer Pal's [REST API](/guide/rest-api)
instead of rebuilding the bridge.

**Who it's for:** developers comfortable building an MCP server.

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

These aren't commitments, just what I'm thinking about after 2.0:

- **Custom skills as first-class.** Today you extend the skills by overriding a
  fragment and `@include`-ing your own files. Registering a standalone skill —
  named, described, and loaded when it's relevant — is a natural next step.
- **Personas.** Presets that bundle a tool set with its own context and skills,
  so you can switch the AI's whole setup for a focused task.
- **Workflows, or subagents, or neither.** The original idea was "workflows":
  fixed tool-call sequences the AI runs but doesn't improvise. But maybe that's
  just a command-oriented skill, or maybe subagents are the better version.
  Still undecided.

Have an opinion on any of these?
[GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions) or
[Discord](https://discord.gg/rmU3DSzgwH).

## Stable core

The core repo won't change much after 2.0, and that's on purpose. Extensions
don't break when the core doesn't move.

Starting with 2.0, breaking changes need at least a minor version bump (2.1,
3.0); patch releases stay backward-compatible. Core work continues on bug fixes,
new Live API features as they land, and efficiency — cost matters whether you're
on a local model, a subscription, or pay-as-you-go — but through small
improvements, not rewrites.

## Contributing back

If you find tweaks to the default skills or tool and parameter descriptions that
make the AI behave better, send a pull request — improvements to the built-ins
reach everyone. A few areas I'm especially interested in:

- **Skills and chat system instructions** — changes to the built-in Producer Pal
  Skills or the Chat UI system instructions, especially ones backed by
  experiments that show better behavior.
- **Coding-agent skills** — more [Agent Skill](/guide/skills) examples for other
  workflows and agents. I'm happy to feature good ones on this site.
- **MIDI notation and transforms** — experiments with other notation systems,
  and additions to the [transforms](/features/midi-notation#transforms) syntax.
  Ask first so we can agree on the grammar direction.

Changes like these land best with
[evals](https://github.com/adamjmurray/producer-pal/blob/main/evals/README.md)
that show they help — ideally on both large and small models, since a prompt
tweak that helps a big model can hurt a small local one.

The toolset itself has stabilized, so changing a tool or adding one takes some
convincing. Ask first. The
[developer guide](https://github.com/adamjmurray/producer-pal/blob/main/DEVELOPERS.md)
covers the strict code-quality checks — they're there to fight AI slop, not to
gatekeep — and how to work with them.

Questions, or an extension to show off?
[GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions) or
[Discord](https://discord.gg/rmU3DSzgwH).
