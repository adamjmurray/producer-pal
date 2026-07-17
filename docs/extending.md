# Extending Producer Pal

Producer Pal is designed as a stable core with multiple extension points. The
core handles Ableton Live control via MCP, optimized for efficiency (doing the
most with the fewest tools and tokens). Everything else is an extension.

This means you don't need to modify the core to customize Producer Pal for your
workflow or add new capabilities. There are several ways to extend it depending
on your needs.

::: warning WORK IN PROGRESS

Most of the extension points described on this page are planned for version 2.0
and are not yet available. This page describes the direction Producer Pal is
heading. See the [roadmap](/roadmap).

:::

## Context Customization

Shape how the LLM uses Producer Pal's existing tools — no code required.

- **Skills** — Teach the LLM new workflow patterns, or override the built-in
  skills with your own. Skills are text that describe how to accomplish tasks
  using Producer Pal's tools — like recipes the LLM follows. Overriding and
  trimming the built-in skills is available today — see
  [Customizing Skills](/guide/customizing-skills). (Adding new custom skills
  alongside the built-ins is still planned.)
- **Tool description overrides** — Tune how the LLM interprets specific tools
  and parameters for your workflow.
- **Tool presets** — Curate which tools are available for focused tasks.
- **Custom system instructions** — Add your own guidance for the LLM in the
  built-in Chat UI, like preferred genres, mixing conventions, or workflow
  rules. (External clients like Claude Desktop have their own system prompt
  settings.)

**Who it's for:** Anyone who can write clear instructions. If you can describe a
music production workflow in plain language, you can create a skill.

::: info PARTIALLY AVAILABLE

Built-in skill overrides ([Customizing Skills](/guide/customizing-skills)) and
custom system instructions (the Chat UI's
[context editor](/guide/chat-ui#header-bar)) shipped in Producer Pal 2.0. The
rest of context customization is planned — see the [roadmap](/roadmap) for
details.

:::

## Workflows

Pre-defined sequences of tool calls that execute without the LLM reasoning
through each step. The LLM picks the right workflow and fills in parameters —
execution is mechanical.

Some operations are well-understood sequences where LLM creativity adds nothing
and unreliability adds risk. "Set up a standard drum rack track with a 4-bar
loop" is always the same steps: create track, add Drum Rack, create clip. A
workflow handles this reliably every time.

**How workflows differ from skills:** Skills teach the LLM _how_ to do something
and it still makes each tool call. Workflows _are_ the tool calls — the LLM
triggers them but doesn't improvise the steps.

::: info COMING SOON

Workflows are planned for a later 2.0.x release, after context customization is
stable.

:::

## Companion MCP Servers

Add entirely new capabilities by building a separate MCP server. The LLM sees
all connected MCP servers and combines their tools naturally — your server's
tools work alongside Producer Pal's without any special integration.

**Example use cases:**

- Audio analysis and feature extraction
- Generative algorithms (Euclidean rhythms, Markov chains, etc.)
- Advanced sample management and tagging
- Hardware controller integration
- External DAW bridges

A companion server can be any MCP server in any language — it just needs to
provide tools the LLM can use. For servers that need direct Live API access,
`max-mcp-template` will provide a starter project with Node for Max / V8
architecture and shared libraries for bar|beat notation parsing, the chunking
protocol, and Live API convenience wrappers.

**Who it's for:** Developers comfortable with MCP server development.

::: info COMING SOON

The `max-mcp-template` and shared libraries are in development. Check the
[roadmap](/roadmap) for progress.

:::

## REST API

Producer Pal includes a [REST API](/guide/rest-api) that exposes the same tools
available to the LLM over HTTP. This lets you script Ableton Live for your own
needs — build automation, custom integrations, or tools that don't use AI at
all.

The REST API is available today and doesn't require any extension
infrastructure.

## Choosing the Right Extension Point

| I want to...                          | Use                   |
| ------------------------------------- | --------------------- |
| Script Ableton Live without AI        | REST API              |
| Teach the LLM a production technique  | Skill                 |
| Customize how the LLM uses tools      | Description overrides |
| Automate a repetitive multi-step task | Workflow              |
| Add a capability Live API can't do    | Companion MCP server  |

## The Ecosystem Vision

The goal is a vibrant ecosystem where people create and share extensions. The
core repo is deliberately stable — it won't change often after 2.0 — and that
stability is a feature. Extensions don't break when the core doesn't change.

Innovation happens at the edges: writers sharing skills, developers building
companion servers, and the community finding creative new ways to use AI in
music production. The core repo is not the bottleneck.

Starting with 2.0, breaking changes will require at least a minor version bump
(e.g., 2.1 or 3.0) — patch releases are always backward-compatible. This gives
extension authors a stable foundation to build on.

## Contributing Back to Core

Contributions are genuinely welcome — the stable-core rule is about keeping the
tool _surface_ small and reliable, not about turning ideas away. A few areas are
especially open to experimentation:

- **Skills and chat system instructions** — proposed changes to the built-in
  Producer Pal Skills or the Chat UI system instructions, especially ones backed
  by experiments showing better LLM behavior.
- **Coding-agent skills** — more [Agent Skill](/guide/skills) examples for
  different workflows and agents. Good ones can be featured on this site.
- **MIDI notation and transforms** — experiments with alternative notation
  systems, and additions to the [transforms](/features/midi-notation#transforms)
  syntax (worth asking about first so we can agree on the grammar direction).

Changes to skills, tool descriptions, or argument descriptions are most likely
to be accepted when backed by
[evals](https://github.com/adamjmurray/producer-pal/blob/main/evals/README.md)
demonstrating improved efficacy — ideally across both large and small models
where applicable, since a prompt tweak that helps a frontier model can regress a
small local one.

Producer Pal will also continue optimizing for efficiency — reducing costs
whether you're using small local models, subscription quotas, or pay-as-you-go
cloud APIs — but through targeted improvements, not major overhauls or breaking
changes.

The core toolset has stabilized, so changing a tool's shape or adding new tools
takes some convincing — please ask first. The
[developer guide](https://github.com/adamjmurray/producer-pal/blob/main/DEVELOPERS.md)
explains the strict code-quality checks (they exist to combat AI slop, not to
gatekeep) and how to work with them.

Want to discuss ideas for extensions? Join the conversation on
[GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions) or
[Discord](https://discord.gg/rmU3DSzgwH).
