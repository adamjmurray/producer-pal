---
title: Optimizing Cost & Context
description:
  Cut what Producer Pal costs per conversation — narrow the toolset, trim the
  skills, pick a cheaper notation and response format, and keep tool results
  small.
head:
  - - meta
    - name: keywords
      content:
        Producer Pal tokens, reduce token usage, Ableton MCP cost, toolset,
        small model mode, context window, cheaper AI music production
---

# Optimizing Cost & Context

Every Producer Pal conversation starts with a fixed overhead: the schemas for
the tools your client can call, plus the [skills](/features#skills) that teach
the AI how to use them. With everything switched on that's roughly **80,000
characters — about 20,000 tokens** before you type a word.

You can cut that by more than half without giving up anything you actually use.
Worth doing if you run a [small or local model](/installation/choose-local) with
a tight context window, if you pay per token, or if you only ever use part of
Producer Pal.

## What you're paying for

| Sent at the start of every conversation | Characters | Tokens  |
| --------------------------------------- | ---------- | ------- |
| Tool schemas (the 21 default tools)     | ~38,000    | ~9,500  |
| [Skills](/features#skills)              | ~42,000    | ~10,500 |
| **Total**                               | ~80,000    | ~20,000 |

On top of that: your [context and memory](/guide/context), however much you've
written. Then per message, your prompt, the AI's reply, and the result of every
tool call it makes.

Every figure on this page is in **characters**, with **tokens** alongside where
it helps — converted at the usual rough estimate of 4 characters per token.
Characters are what Producer Pal can actually count; tokens depend on the
model's tokenizer. All measurements use the default `bar|beat` notation and
standard skills, and your client wraps the schemas its own way, so treat them as
ballpark.

## Narrow the toolset

The biggest single win, because withholding a tool drops **both** its schema and
the part of the skills that teaches it. Switch off the writing tools and the
transform guide, the arrangement-writing guide, and the device-building guide go
with them.

Schemas plus skills, measured against the default toolset:

| Toolset           | Tools | Characters | Tokens  | Saved |
| ----------------- | ----- | ---------- | ------- | ----- |
| Default           | 21    | ~80,000    | ~20,000 | —     |
| `core,clip,track` | 8     | ~47,000    | ~11,700 | 41%   |
| `read-only`       | 8     | ~30,000    | ~7,600  | 62%   |

Those two rows keep the same number of tools and save very different amounts:
`read-only` wins because dropping every writer takes the whole write-side half
of the skills with it.

Where you set it depends on the client — see
[Choosing a Toolset](/features#toolset) for the full list, or go straight to the
[Chat UI's Tools tab](/guide/chat-ui#tools), the
[`--tools` flag](/guide/npx-cli#toolset), or the REST API's
[per-request header](/guide/rest-api#per-request-toolset).

Toolset is per client, so narrowing your coding agent leaves the Chat UI alone.

## Trim skills you don't need

For areas where you want to keep the tool but not the guidance — you use
transforms, say, but never the generative ones. Every fragment has an
**Include** checkbox in the Chat UI's Skills tab, and the guide has a table of
what to switch off for each thing you never do.

[Trimming skills →](/guide/customizing-skills#trimming-skills-you-don-t-need)

## Small model mode

[Small model mode](/features#small-model-mode) cuts both halves: the skills drop
to a much shorter set, and advanced parameters come out of the tool schemas.

| All tools enabled      | Standard | Small model mode |
| ---------------------- | -------- | ---------------- |
| Schemas (characters)   | ~38,000  | ~22,000          |
| Skills (characters)    | ~42,000  | ~3,000           |
| **Total (characters)** | ~80,000  | **~25,000**      |
| **Total (tokens)**     | ~20,000  | **~6,400**       |

That's 68% off, the largest single reduction available, and it stacks with a
narrow toolset: `read-only` in small model mode comes to ~9,000 characters
(~2,300 tokens), 89% off.

It isn't a pure cost lever, though. It exists to make
[local models](/installation/choose-local) viable, so it trades away capability
— the advanced parameters are gone, and memory is off. Reach for it when the
model needs it, not just to save tokens.

The device setting applies to the Chat UI and every connected client at once. A
REST or MCP client can switch it on for
[just its own requests](/guide/rest-api#per-request-small-model-mode) instead.

## Notation

The [notation guide](/features/midi-notation) is the one part of the skills that
changes with the notation, and the three differ a lot:

| Notation    | Notation guide (characters) | All skills (characters) | All skills (tokens) |
| ----------- | --------------------------- | ----------------------- | ------------------- |
| `bar\|beat` | ~8,300                      | ~42,000                 | ~10,500             |
| `stark`     | ~3,500                      | ~37,000                 | ~9,300              |
| `midi-json` | ~700                        | ~34,000                 | ~8,600              |

`midi-json` needs a twelfth of the guidance `bar|beat` does — it's a JSON array
of note objects, so there's little to teach, and nothing extra for writing
notes. Everything else in the skills is notation-neutral, so that gap _is_ the
whole difference between the two totals.

Still, pick for fit rather than size: the guide is a small slice of the ~80,000
characters a conversation starts with, and the notation decides how well your
model actually writes music. `midi-json` for coding agents, `stark` for small
models, `bar|beat` for conversation.

In [small model mode](#small-model-mode) the order changes — `stark`'s basic
guide is ~2,900 characters against `bar|beat`'s ~1,400 characters — so the
standing recommendation of `stark` for local models is about reliability, not
size.

## Keep responses compact

Tool results are a per-message cost, and they add up over a long session.

- **Response format.** `compact` is a token-optimized literal and the default
  everywhere except the REST API, which defaults to `json` — easier for scripts
  to parse, but larger. Keep `compact` for normal conversations. See
  [`--format`](/guide/npx-cli#flags) and the REST API's
  [format option](/guide/rest-api#response-format-format-json-default).
- **Read only what you need.** The read tools take an `include` list — reading a
  track without `notes` or `devices` is dramatically smaller than
  `include: ["*"]`. Ask for a specific track or clip rather than the whole Live
  Set when you know where you're going.

## Watch your context and memory

[Project context, global context, and memory](/guide/context) are sent every
conversation, so they're a standing cost like the skills. The context editor
shows a character and token count for each one — useful when a global context
you wrote months ago has quietly grown. Keep them to what changes the AI's
behavior.

## How to measure

- **[Skills tab](/guide/context#skills) → Preview** in the Chat UI assembles the
  exact skills document for any notation and model size, with your overrides and
  toolset applied, and gives its size in characters and estimated tokens. A ★
  marks the combination your current settings use.
- **Show message token usage** in [Preferences](/guide/chat-ui#preferences)
  prints input, output, and reasoning tokens under every response. See
  [Token Usage](/guide/chat-ui#token-usage).
- **`npx producer-pal --list-tools`** confirms which tools a client is actually
  getting. See [the CLI reference](/guide/npx-cli#list-tools).
