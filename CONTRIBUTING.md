# Contributing to Producer Pal

Contributions are welcome, and this guide is here to make them easy — not to
gatekeep. Producer Pal has unusually strict automated checks, but they exist to
keep AI coding agents honest, not to raise the bar for humans. If a check is
getting in your way, there's almost always a pragmatic path through it (see
[Working with the strict checks](#working-with-the-strict-checks)), and when in
doubt, open a
[discussion](https://github.com/adamjmurray/producer-pal/discussions) and ask.

For the technical side — building from source, development scripts, testing, and
debugging — see [DEVELOPERS.md](./DEVELOPERS.md).

## Ways to contribute

There's room to get involved at every level of experience and commitment:

- **Use it and talk about it.** Beta testing, feature requests, and sharing your
  experiences in
  [the discussions](https://github.com/adamjmurray/producer-pal/discussions) all
  shape where the project goes.
- **File bug reports** in
  [the issues](https://github.com/adamjmurray/producer-pal/issues) — help me
  reproduce it and I will do my best to fix it. Reproducible cases where LLMs
  misuse the tools are especially valuable.
- **Improve the documentation.** Typo fixes to full guides, all welcome.
- **Make the LLMs behave better.** Skills, tool descriptions, system
  instructions, and [evals](evals/README.md) that demonstrate improvements —
  including small language model optimization (making Ollama/LM Studio work
  better).
- **Strengthen the testing.** End-to-end testing automation and LLM evaluations
  are high-value areas with lots of open ground.
- **Build extensions.** Custom skills, the REST API, and Agent Skills for coding
  agents are where a lot of the interesting innovation happens — see
  [Extending Producer Pal](#extending-producer-pal).
- **Learn from the implementation**, or fork and modify for your own needs
  (please attribute me).

One thing worth knowing before you start a large PR: the core toolset is
deliberately kept stable, so adding new tools or changing tool shapes needs
discussion first. See [Extending Producer Pal](#extending-producer-pal) below —
it explains why, and points to the many areas that are wide open.

Interested in any of this? Open a
[GitHub discussion](https://github.com/adamjmurray/producer-pal/discussions) or
reach out directly.

## Extending Producer Pal

The core is focused on Ableton Live control via MCP — each tool directly wraps
Live API calls, optimized for doing the most with the fewest tools and tokens.
The **toolset has stabilized**: which tools exist and how they're split up won't
change often, and changing a tool's shape or adding a new tool takes some
convincing. Please open a discussion and ask before starting that kind of work —
large PRs that add new tool domains or require external dependencies won't be
accepted without prior agreement.

This is by design. A stable core means extensions don't break, and the
interesting innovation happens through extensions rather than a PR queue.

**There are better ways to add capabilities.** The
[Extending Producer Pal](https://producer-pal.org/extending) page covers the
current extension points — the REST API for scripting Live directly, Agent
Skills for working from coding agents, and custom skills / global context for
shaping LLM behavior without code — plus the ideas under consideration for
what's next.

**What IS welcome as a core PR:** Bug fixes, improvements to default skill text
and tool/argument descriptions, evaluations, documentation, and targeted
optimizations to reduce cost and improve efficiency across all model types. If
you find a tweak that makes the LLM behave better, that can go straight into
core.

**Especially welcome — bring your experiments:** The stable-core rule is about
the tool _surface_, not about ideas. Some areas are explicitly open to
exploration. A quick "here's what I'm thinking" discussion first helps us shape
it together:

- **Skills and chat system instructions.** I'm very open to proposed changes to
  the built-in Producer Pal Skills and the built-in Chat UI system instructions,
  especially when they come out of real experiments showing better LLM behavior.
- **Coding-agent skills.** Producer Pal ships a portable
  [Agent Skill](https://producer-pal.org/guide/skills) (the `SKILL.md`
  convention used by Claude Code, Codex CLI, Gemini CLI, and others) in
  `examples/skills/`. I'd love more examples covering different workflows and
  agents — and I'm happy to feature good ones on the website.
- **MIDI notation and transforms.** Experiments with alternative MIDI notation
  systems are welcome, and I'm open to additions to the
  [MIDI transforms](https://producer-pal.org/features/midi-notation#transforms)
  syntax. Worth asking about first so we can agree on the grammar direction.

**Back behavior changes with evals.** Changes to skills, tool descriptions, or
argument descriptions are most likely to be accepted when they come with
[evals](evals/README.md) demonstrating improved efficacy — ideally across both
large and small models where applicable, since a prompt tweak that helps a
frontier model can regress a small local one (and vice versa). "It behaves
better for me" is a good start; a scenario that _shows_ it is what lands the
change.

## Working with the strict checks

Producer Pal is developed primarily with AI coding agents, and the strict,
automated code-quality gates (see
[Code Quality Checks](./DEVELOPERS.md#code-quality-checks) in DEVELOPERS.md)
exist to combat "AI slop" — the long files, duplicated logic, suppressed
warnings, and untested branches that agents accumulate when nothing stops them.
It works remarkably well, and it's a big part of why the codebase stays
navigable for humans and agents alike. It is **not** meant to gatekeep
contributions.

So don't let the checks derail what you're actually trying to build:

- **You're not responsible for pre-existing debt outside your change.** If a
  duplication or coverage check trips on code you didn't touch — say, it wants
  you to de-duplicate something in an area unrelated to your feature — that is
  not a detour you need to take. Leave it.
- **Thresholds can be relaxed temporarily.** Several limits (duplication,
  coverage, and lint-suppression counts) are just numbers in config files
  (`config/.jscpd*.json`, the thresholds in `vitest.config.ts`, and the
  suppression-limit tests). If a strict threshold is blocking exploration or a
  legitimate feature, it's fine to bump it so you can keep moving — just call it
  out in your PR. Restoring it to the earlier level can happen as a follow-up,
  often in the main repo by the maintainer, so it doesn't have to be your
  problem.
- **When in doubt, ask.** Open a
  [discussion](https://github.com/adamjmurray/producer-pal/discussions) or a
  [Discord](https://discord.gg/rmU3DSzgwH) thread. It's better to check than to
  spend hours satisfying a check that was never the point of your change.

The goal is a clean codebase _and_ a low-friction contribution experience. If
those two ever seem to conflict on your PR, flag it — that's useful feedback.

## Branching Strategy

- **`main`** — latest stable release
- **`dev`** — where the next release is prepared; PRs merge here

**Which branch to work from?** You can base your work off either branch:

- **From `main`** (recommended for most contributors) — more stable starting
  point. When you're ready to merge, AI tooling can help resolve any conflicts
  with `dev`.
- **From `dev`** — gives you the latest in-progress changes, but `dev` is
  heavily iterated on and can be volatile. New conflicts may appear as it
  evolves, and it may be temporarily unstable.

## Getting set up

Ready to write code? [DEVELOPERS.md](./DEVELOPERS.md) covers building from
source, the development scripts, the code-quality checks in detail, and testing
and debugging workflows.
