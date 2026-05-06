---
title: Ableton Live Agent Skill
description:
  Producer Pal ships a portable Agent Skill for Ableton Live — works as a Claude
  Skill, Codex Skill, Gemini Skill, or any coding agent that supports the
  SKILL.md convention. AI music production from any agent runtime, no MCP client
  required.
head:
  - - meta
    - name: keywords
      content:
        Agent Skills, Coding Agent Skills, Claude Skills, Claude Code Skills,
        Codex Skills, Codex CLI Skills, Gemini Skills, Gemini CLI Skills,
        SKILL.md, Ableton Live Agent Skill, Ableton Skill, Ableton Live skill,
        Ableton AI agent, AI music production skill, Producer Pal skill
  - - meta
    - property: og:title
      content: Ableton Live Agent Skill — Producer Pal
  - - meta
    - property: og:description
      content:
        Drop-in Agent Skill for Ableton Live. Works with Claude Code, Codex CLI,
        Gemini CLI, and any coding agent that supports the SKILL.md convention —
        no MCP client required.
---

# Ableton Live Agent Skill

Producer Pal ships a portable Agent Skill that lets coding agents control
Ableton Live through Producer Pal's [REST API](/guide/rest-api) — no MCP client
required.

Agent Skills are a small, open convention shared across the major coding-agent
CLIs: a folder containing a `SKILL.md` (with frontmatter describing when to use
it) plus optional scripts and resources. The folder is loaded lazily when the
agent decides the skill is relevant. The same folder works across all three:

| Tool                                                              | Skills location                    |
| ----------------------------------------------------------------- | ---------------------------------- |
| [Claude Code](https://docs.claude.com/en/docs/claude-code/skills) | `~/.claude/skills/<name>/SKILL.md` |
| [Codex CLI](https://developers.openai.com/codex/skills/)          | `~/.codex/skills/<name>/SKILL.md`  |
| [Gemini CLI](https://geminicli.com/docs/cli/skills/)              | `~/.gemini/skills/<name>/SKILL.md` |

::: info When to use this vs MCP

Producer Pal's [MCP server](/installation) is the recommended path when your
agent supports MCP — the tools come with rich descriptions and the LLM picks
them up automatically.

The skill is for **REST-API-driven workflows**: agents not configured with the
Producer Pal MCP server, scripts and pipelines that don't run an MCP client, or
environments where you want a single drop-in folder rather than per-tool MCP
setup.

:::

## Install

Copy the
[`producer-pal/`](https://github.com/adamjmurray/producer-pal/tree/main/examples/skills/producer-pal)
folder from the Producer Pal repo into your agent's skills directory.

```bash
# Clone (or download) the repo, then copy the skill folder
git clone --depth 1 https://github.com/adamjmurray/producer-pal.git
cp -r producer-pal/examples/skills/producer-pal ~/.claude/skills/
# or ~/.codex/skills/, or ~/.gemini/skills/
```

The skill folder contains a `SKILL.md` (frontmatter + instructions for the
agent) and a `ppal.mjs` (the Node CLI it shells out to).

## How it works

When the user asks the agent something Producer-Pal-shaped ("set tempo to 120",
"what's in track 2", "make a 4-bar drum loop"), the agent loads `SKILL.md` and
follows its bootstrap:

1. **List tools** — `node ppal.mjs --list-tools` returns the full tool catalog
   with input schemas, so the agent knows what's available without baking it
   into the skill.
2. **Call `ppal-connect`** — the agent's first call. Its response includes the
   up-to-date Producer Pal Skills (bar|beat notation, MIDI syntax, code
   transforms, conventions) — the same instructions Producer Pal's MCP clients
   receive at session start. The skill stays small; the heavy guidance comes
   from Producer Pal itself.
3. **Use the other tools** per those instructions, via
   `node ppal.mjs <tool> [json-args]`.

Because the skill is just a thin pointer + bootstrap, it stays correct as
Producer Pal evolves: new tools, schema changes, and skill updates land in
`ppal-connect`'s response automatically.

## The bundled script

`ppal.mjs` is a zero-dependency Node 18+ script that wraps Producer Pal's REST
API. It's both the CLI the skill shells out to and a small library you can
`import` in your own code:

<<< ../../examples/skills/producer-pal/ppal.mjs{js}

::: tip Prefer Python?

The skill ships with the Node script because nearly every agent runtime has Node
available, but a zero-dependency Python equivalent is also maintained — see the
[Python sample script](/guide/rest-api#python). To use it, swap the
`node ppal.mjs` commands in `SKILL.md` for `python ppal.py` and drop `ppal.py`
into the skill folder.

:::

## Source

- Skill folder:
  [`examples/skills/producer-pal/`](https://github.com/adamjmurray/producer-pal/tree/main/examples/skills/producer-pal)
- REST API reference: [REST API guide](/guide/rest-api)
