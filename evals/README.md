<!--
Producer Pal
Copyright (C) 2026 Adam Murray, Taylor Haun
AI assistance: Claude (Anthropic), Codex (OpenAI)
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Evals

Two CLI tools for testing LLM behavior with Producer Pal's MCP tools:

- **`scripts/eval`** - Automated evaluation scenarios with scoring and
  assertions
- **`scripts/chat`** - Interactive chat sessions for manual testing

Both require Ableton Live running with the Producer Pal device loaded.

## Eval CLI

Runs predefined scenarios against Ableton Live and scores the results.

```bash
scripts/eval [options]
```

### Options

| Flag                  | Description                                       |
| --------------------- | ------------------------------------------------- |
| `-m, --model <model>` | Model to test (required, repeatable)              |
| `-t, --test <id>`     | Run specific scenario by ID (repeatable)          |
| `-a, --all`           | Run all scenarios                                 |
| `--small-model`       | Enable small-model mode (basic skills + schemas)  |
| `--json`              | JSON tool-result output (default: compact)        |
| `--tools <list>`      | Tool subset, comma-separated (default: all)       |
| `--live-api`          | Enable the Direct Live API tool (`ppal-live-api`) |
| `-j, --judge <model>` | Judge model (default: `gemini-3-flash-preview`)   |
| `-s, --skip-setup`    | Skip Live Set setup (reuse existing connection)   |
| `--skip-judge`        | Skip the LLM-as-judge step (checks only)          |
| `--skip-reflection`   | Skip the self-reflection turn after a failure     |
| `--no-seed-connect`   | Let the model run the opening connect turn        |
| `-q, --quiet`         | Suppress detailed AI and judge responses          |
| `-r, --repeat <N>`    | Run each scenario N times (for flakiness)         |
| `-u, --usage`         | Show token usage per turn                         |
| `--no-save`           | Skip writing JSON result files to disk            |
| `-l, --list`          | List available scenarios                          |

### Model format

Models use `provider/model` format, or just the model name if the provider can
be inferred from the prefix:

| Format                          | Provider    |
| ------------------------------- | ----------- |
| `gemini-3-flash-preview`        | google      |
| `claude-sonnet-4-5`             | anthropic   |
| `gpt-5-nano`                    | openai      |
| `google/gemini-3-flash-preview` | google      |
| `anthropic/claude-sonnet-4-5`   | anthropic   |
| `codex-code/sol`                | codex-code  |
| `codex-code/terra`              | codex-code  |
| `codex-code/luna`               | codex-code  |
| `claude-code/sonnet`            | claude-code |
| `claude-code/opus`              | claude-code |
| `claude-code/haiku`             | claude-code |
| `claude-code/fable`             | claude-code |
| `openrouter/some-model`         | openrouter  |
| `local/model-name`              | local       |

### Examples

```bash
# Run all scenarios with a specific model
scripts/eval -a -m gemini-3-flash-preview

# Compare two models on one scenario
scripts/eval -t connect-to-ableton -m gemini-3-flash-preview -m claude-sonnet-4-5

# Compare Codex subscription models (requires `codex login`)
scripts/eval -t connect-to-ableton \
  -m codex-code/sol -m codex-code/terra -m codex-code/luna

# Compare subscription CLIs against each other (requires `codex` and `claude`)
scripts/eval -t connect-to-ableton -m codex-code/terra -m claude-code/sonnet

# Skip Live Set reopening (reuse current MCP connection)
scripts/eval -t connect-to-ableton -s
```

### Testing local models

Local models (Ollama, LM Studio, etc.) need special handling:

1. **Always specify the model explicitly** with the `local/` prefix
2. **Enable small-model mode** (`--small-model`) for the basic skills tier and
   simplified tool descriptions

```bash
# Test a local model
scripts/eval -m local/glm-4.7-flash -t connect-to-ableton --small-model

# Test a different local model
scripts/eval -m local/qwen3-8b -t duplicate --small-model
```

The local provider connects to `http://localhost:11434/v1` by default (Ollama).
Override with `-b` / `--base-url` in the chat CLI, or set `LOCAL_BASE_URL` in
`.env` for evals.

### Testing subscription CLIs

`claude-code` and `codex-code` are not API providers — they drive an installed
coding-agent CLI as a subprocess (`claude -p --output-format stream-json`,
`codex exec --json`), so a run bills the logged-in subscription instead of a
metered API key. The CLI owns the conversation and the MCP connection; each turn
is a fresh process that resumes the previous turn's session id.

```bash
# Requires `claude` on PATH and a logged-in subscription (`claude auth login`)
scripts/eval -m claude-code/sonnet -t connect-to-ableton

# Requires `codex` on PATH and `codex login`
scripts/eval -m codex-code/terra -t connect-to-ableton
```

Both transports strip the vendor's API-key environment variables before
spawning, so an exported `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` cannot silently
turn a subscription run into a billed one. Both also run the CLI stripped down
to Producer Pal: built-in tools off, settings and plugins off, other MCP servers
ignored, and the eval's system instructions REPLACING the CLI's own agent prompt
(which is also what keeps the user's memory files out of the run).

On Codex the plugin part takes its own flag, `--disable apps`.
`--ignore-user-config` does not reach the installed apps, and they come back as
MCP tools — a second Producer Pal among them, competing with the eval's server.

**A big tool result fails the run on `claude-code`.** Past a size limit the
claude CLI saves a tool result to a file and hands the model a 2KB preview
instead. The model is what gets the preview, so the run would grade a model that
never received the Skills `ppal-connect` returns. The transport treats that stub
as a failed turn rather than let a meaningless score through. It fires on the
full toolset today; `--tools` a subset, or use another provider. No env var
raises the limit (`MAX_MCP_OUTPUT_TOKENS` is a different cap and does not).

A looping model is bounded the same way it is on the AI SDK path. Neither CLI
takes a step limit we can rely on, so the transports count the model's actions
(each tool call, each reply) off the event stream and kill the subprocess once
the turn goes past the shared budget in `evals/shared/step-budget.ts`. The run
then fails as a blown budget in seconds rather than as a five-minute timeout.

Two caveats when comparing a subscription-CLI run against anything else:

- **Token counts are not comparable across transports.** Each vendor defines
  `input_tokens` differently: Codex reports the total (its `cached_input_tokens`
  is a subset of it), while Anthropic reports only the uncached portion, with
  `cache_read_input_tokens` / `cache_creation_input_tokens` alongside. A real
  `claude-code` turn that processed ~38k tokens prints `tokens: 18` — everything
  else was a cache read. The mapping deliberately matches the `anthropic` AI SDK
  path so the two Anthropic routes agree; it does NOT line up with `codex-code`.
- **Session files outlive the run.** Claude Code keys its on-disk session store
  by working directory, and each eval session uses a fresh temp directory that
  `close()` removes. The transcript under `~/.claude/projects/` stays behind,
  one entry per eval session. (The judge passes `--no-session-persistence` and
  leaves nothing; turns cannot, since they resume by session id.)

Point `CLAUDE_CODE_BIN` / `CODEX_BIN` at a specific binary when the CLI is not
on PATH. The transport tests use the same variables to swap in a fixture that
emits canned JSONL, so `evals/chat/agent-cli/` is testable with neither CLI
installed.

Adding another CLI is a protocol module implementing `AgentCliTransport` (argv,
stream parsing, model names) plus one entry in
`evals/chat/agent-cli/agent-cli-registry.ts`; spawning, session dirs, session-id
continuity, turn rendering, and judging are already shared.

### Run environment

A run mirrors the device's settings panel: you choose the environment with CLI
flags, then the scenarios run as conversations against it. The environment is
server-side state applied before each scenario:

| Flag             | Effect                                                            |
| ---------------- | ----------------------------------------------------------------- |
| _(none)_         | Default: compact output, all standard tools, normal model         |
| `--small-model`  | Basic skills tier + reduced param schemas (small-model mode)      |
| `--json`         | JSON tool-result output (default is compact, the product default) |
| `--tools <list>` | Restrict to a tool subset (short or full names)                   |
| `--live-api`     | Add the opt-in Direct Live API tool on top of the toolset         |

Tests declare what they need via `requires` (e.g. the transforms DSL, bracket
notation, a specific tool, a small-model-excluded param). When the active
environment can't satisfy a requirement — e.g. a transforms scenario under
`--small-model`, or a scenario needing a tool you left out of `--tools` — the
scenario is **skipped** (reported as `skipped`, not `fail`) so scores stay
apples-to-apples.

```bash
# Default environment
scripts/eval -t connect-to-ableton -m gemini-3-flash-preview

# Small-model mode (transforms/bracket scenarios will skip)
scripts/eval -a -m local/qwen3-8b --small-model

# A restricted toolset (scenarios needing other tools will skip)
scripts/eval -a -m gemini-3-flash-preview --tools connect,read-track,create-clip
```

**Know what an environment grades before you pay for the run.** `--list` takes
the same environment flags, marks every scenario that environment would skip,
and counts what's left:

```bash
scripts/eval --list --small-model
# … small-model: grades 52 of 84 (regression 15/25, capability 37/59)
```

A small-model score is over a much smaller surface than the default run — read
it as "of what a small model was given", never as comparable to a default score.

### Scenarios

List available scenarios:

```bash
scripts/eval -l
```

Run `scripts/eval -l` for the current list. Scenarios are tagged as
**regression** (should always pass) or **capability** (improvement targets, may
have low pass rates).

### The seeded connect turn

Nearly every scenario opens with "Connect to Ableton Live", and every model
answers it the same way: one `ppal-connect` call, then a sentence acknowledging
it. That turn is setup — the behavior under test starts at the next message —
but it is the run's most expensive turn, because the connect result (Live Set
overview + Producer Pal skills) is re-sent as input on the round trip that
produces the acknowledgment.

So the runner writes that turn into the conversation itself, for free. It is not
a recording: `ppal-connect` is called for real over MCP against the Live Set
that is actually open, under the run's actual config, so nothing can go stale.
Only the assistant's closing sentence is canned, and the model reads the same
context either way. Turn numbering is unchanged, so `turn: 0` assertions still
mean the connect turn.

A scenario is seeded when its first message is the connect message and something
follows it. Set `seedConnect: false` on scenarios that GRADE that turn — its
prose, or what it did or didn't write (`connect-to-ableton`, the
`context-onboarding-*` family). `--no-seed-connect` disables it for a whole run,
which is how to A/B the seeding against real connect turns.

Note that a `{ type: "tool_called", tool: "ppal-connect", turn: 0 }` assertion
passes trivially in a seeded scenario. `connect-to-ableton` is where "does the
model reach for `ppal-connect`" is actually graded.

The agent-CLI providers (`claude-code`, `codex-code`) are never seeded: the CLI
resumes a session by id and owns its own history, so there is nothing to write
into and they fall back to a real connect turn. Worth remembering when comparing
one of those runs against any other provider — only one of them paid for that
turn.

### Scoring

These assertions decide pass/fail:

- **`tool_called`** - Verifies the right tool was called (with optional arg
  matching). Failed calls don't count — see below.
- **`state`** - Verifies Live Set state via MCP tool calls
- **`custom`** - Arbitrary callback assertions on turn data

Plus:

- **`llm_judge`** - LLM evaluates response quality with pass/fail + issues. It
  gates the result unless the scenario sets `judgeAdvisory: true`, which keeps
  the commentary but stops it flipping a run to fail.
- **`response_contains`** - Text/regex patterns in the assistant's prose.
  Reported as **Signals**, never gating: the list of acceptable synonyms is
  unbounded and drifts with every model, so a run that made the right edit and
  called it "turned those up" instead of "boosted" is not a regression. Pin the
  outcome with `state` or `custom`; keep the pattern for drift signal.
- **`token_usage`** - Tracks token efficiency against a target budget
  (informational only)

**Failed tool calls.** A model that hits a tool error, fixes its arguments and
calls again still lands the outcome, so it still passes — but the run reports
**Tool errors** and each failed call takes 10% off its score (capped at half). A
flat cost, not a share of the calls made: rating the share would pay a model for
padding a run with extra successful calls. Grading reads successful calls only:
`tool_called` counts them, and `getToolCalls` returns them. Use
`getAllToolCalls` when the attempt itself is what's graded ("did it reach for a
tool it shouldn't have").

The **Score** shown per scenario and in the comparison table is the check pass
rate (or the trial pass rate under `-r N`), discounted by that penalty. A clean
run outranks a recovered one without either being marked a failure.

The judge defaults to Gemini 3 Flash. Override with `-j`, or skip it entirely
with `--skip-judge`.

When using `-r N`, the summary aggregates across trials: checks are totaled,
tool errors are summed, efficiency is averaged, and judge shows a pass rate.

Every trial reopens the Live Set, so trial 2 is never graded on trial 1's
leftovers. Scenarios that declare `reuseLiveSet` — they reset whatever they
write — skip the reopen and run faster.

### Comparing models

Pass `-m` multiple times to run the same scenarios across models in one run
environment. Results are displayed in a comparison table when more than one
model is tested.

```bash
# 2 scenarios x 2 models = 4 runs, one table
scripts/eval -a -m gemini-3-flash-preview -m claude-sonnet-4-5
```

To compare environments (e.g. default vs `--small-model`), do a run per
environment and diff them with `scripts/eval-report --compare <runId> <runId>`.

## Chat CLI

Interactive chat for manual testing and debugging.

```bash
scripts/chat [options] [text...]
```

Every provider except `claude-code` and `codex-code` is supported: those two run
through an agent-CLI transport (a spawned `claude` / `codex` subprocess), which
only the eval CLI drives.

### Options

| Flag                             | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `-m, --model <model>` (required) | Model in `provider/model` format             |
| `-1, --once`                     | Exit after one response                      |
| `-t, --thinking <level>`         | Thinking/reasoning level (provider-specific) |
| `-r, --randomness <number>`      | Temperature (0.0-1.0)                        |
| `-o, --output-tokens <number>`   | Max output tokens                            |
| `-i, --instructions <text>`      | System instructions                          |
| `-s, --sequence <messages...>`   | Multiple messages to send in sequence        |
| `-f, --file <path>`              | File containing messages (one per line)      |
| `-b, --base-url <url>`           | Base URL for local provider                  |
| `-n, --no-stream`                | Disable streaming                            |
| `-d, --debug`                    | Log all API responses                        |

### Examples

```bash
# Quick one-shot test with Gemini
scripts/chat -m gemini-3-flash-preview -1 "list tracks in the set"

# Interactive session with Claude
scripts/chat -m claude-sonnet-4-5

# Test a local model
scripts/chat -m local/glm-4.7-flash -1 "connect to Ableton"

# Local model with custom server URL
scripts/chat -m local/some-model -b http://localhost:1234/v1 -1 "list tracks"
```

## Environment variables

Set these in `.env` at the project root:

| Variable         | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `GEMINI_KEY`     | Google Gemini API key                                   |
| `ANTHROPIC_KEY`  | Anthropic API key                                       |
| `OPENAI_KEY`     | OpenAI API key                                          |
| `OPENROUTER_KEY` | OpenRouter API key                                      |
| `LOCAL_API_KEY`  | Local server API key (optional)                         |
| `LOCAL_BASE_URL` | Local server URL (default: `http://localhost:11434/v1`) |
| `MCP_URL`        | MCP server URL (default: `http://localhost:3350/mcp`)   |

The subscription CLIs take no key. `CLAUDE_CODE_BIN` and `CODEX_BIN` override
which executable is spawned (see
[Testing subscription CLIs](#testing-subscription-clis)).

## Prerequisites

- Ableton Live running with the Producer Pal Max for Live device
- The MCP server must be responsive (eval auto-opens Live Sets and waits for the
  server)
- API keys configured for the providers you want to test
- For local models: Ollama, LM Studio, or another OpenAI-compatible server
  running
- For `claude-code` / `codex-code`: that CLI installed and logged in

## Adding scenarios

Scenarios are defined in `evals/scenarios/defs/`. Each file exports an
`EvalScenario` object:

```typescript
export const myScenario: EvalScenario = {
  id: "my-scenario",
  description: "What this tests",
  kind: "regression",
  liveSet: "basic-midi-4-track", // from evals/live-sets/
  messages: ["Connect to Ableton Live", "Do something specific"],
  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },
    // Non-gating drift signal — the state check below is what grades the run.
    { type: "response_contains", pattern: /expected/i },
    {
      type: "state",
      tool: "ppal-read-track",
      args: { trackIndex: 0 },
      expect: { name: "Drums" },
    },
  ],
};
```

Register new scenarios in `evals/scenarios/defs/index.ts` and
`evals/scenarios/load-scenarios.ts`.

### Design guidelines

- **Every scenario costs a full run.** Each one needs Ableton Live, opens a Live
  Set, and adds minutes to the suite — and the suite is already long enough that
  most runs are a filtered subset, not the whole thing. Add a scenario when you
  find a bug, ship a tool, or need to compare models on something specific;
  don't add one for coverage's sake.
- **Fold a new case into an existing scenario when it fits.** An extra turn on a
  scenario that already opened the right Live Set is far cheaper than a new
  scenario, and often reads better. Keep it separate when the new case must be
  measured UNPRIMED — a reach-for probe (which API/idiom does the model pick
  unprompted?) is worthless once an earlier turn has shown it the answer.
- **Default to no judge.** `tool_called`, `state`, and `custom` are fast, cheap,
  and reproducible; a judge costs an LLM call per scenario and miscounts
  anything musical. Add `llm_judge` only when the thing being graded is the
  assistant's PROSE and no state check can see it — did it offer, did it re-ask,
  did it accept a no. If deterministic checks already pin the outcome and you
  only want the commentary, mark it `judgeAdvisory: true`.
- **Grade outcomes, not paths.** Assert on the final state (e.g., "clip has
  these notes") rather than the exact sequence of tool calls. This avoids
  penalizing models that find valid alternative approaches. Grading words is the
  same mistake one level down, which is why `response_contains` never gates.
- **Keep messages unambiguous.** Vague prompts create flaky evals. If a scenario
  fails at 0%, suspect the prompt before the model.
- **Regression vs capability:** Tag scenarios as `kind: "regression"` when they
  should always pass (use these to catch regressions). Tag as
  `kind: "capability"` for aspirational tests that target difficult tasks —
  these start with low pass rates and graduate to regression once stable.
- **Use `-r N` to diagnose flakiness.** If a regression eval fails
  intermittently, run it 3 times to confirm whether it's flaky or broken before
  investigating.
