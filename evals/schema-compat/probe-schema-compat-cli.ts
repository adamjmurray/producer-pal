// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The agent-CLI half of the schema-compat probe: do the coding-agent CLIs
 * (Codex, Claude Code) accept and correctly fill our richer tool-input schema
 * shapes?
 *
 * The sibling probe hands schemas straight to the AI SDK, which the agent CLIs
 * can't be reached through — they own their own MCP connection. So this one
 * serves each variant from a throwaway MCP server (./probe-mcp-server.ts),
 * points the CLI's transport at it, and reads the arguments off the wire. Same
 * variant corpus, same report; no Ableton, no API key.
 *
 * Measures the CLI as a client, not the raw model: system prompt, tool-name
 * mangling, and any schema rewriting the CLI does are all in the signal. That
 * is the point — it is what our users' clients actually do.
 *
 * Run: node evals/schema-compat/probe-schema-compat-cli.ts [models...] [flags]
 *   models: provider/model, e.g. codex-code/luna (the default) or
 *           claude-code/sonnet.
 *   flags:  --repeat=N     draws per cell (default 1; each draw spawns a CLI
 *                          subprocess, so repeats are far costlier than on the
 *                          AI SDK path)
 *           --variant=id   probe only this variant (repeatable)
 *
 * Unlike the AI SDK probe there is no `toolChoice: "required"` here, so a
 * `no-call` cell means the CLI chatted instead of calling — not a schema
 * failure on its own.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { spawnAgentCli } from "#evals/chat/agent-cli/agent-cli-spawn.ts";
import { type AgentCliTransport } from "#evals/chat/agent-cli/agent-cli-transport.ts";
import { parseModelArg } from "#evals/shared/parse-model-arg.ts";
import { startProbeMcpServer } from "./probe-mcp-server.ts";
import {
  type CellResult,
  numArg,
  runProbeMatrix,
  truncate,
} from "./probe-report.ts";
import { VARIANTS, type Variant } from "./schema-compat-variants.ts";

/** One CLI turn is one tool call; a long budget would only buy a longer loop. */
const STEP_BUDGET = 4;
/** Wall-clock cap per draw. A CLI turn is slower than an API call, not endless. */
const PROBE_TIMEOUT_MS = 180_000;
const DEFAULT_MODELS = ["codex-code/luna"];

/**
 * Deliberately not the eval system prompt: that one names the ppal-* tools and
 * the Live Set, and the probe's tools are neither. Say only "use the tool".
 */
const PROBE_INSTRUCTIONS =
  "You are testing a tool API. Call exactly one of the available MCP tools to " +
  "do what the user asks, then stop and reply with one short sentence. Do not " +
  "use shell commands, files, web search, or subagents.";

interface Row {
  transport: AgentCliTransport;
  model: string;
}

/**
 * Run one variant against one CLI: publish the schema, spawn a turn, and score
 * the arguments the server actually received.
 *
 * Scoring reads the server's record rather than the CLI's event stream, so a
 * vendor's stream formatting can't alter what we measure.
 *
 * @param row - The transport and model for this table row
 * @param variant - The variant to publish
 * @returns The cell result for this draw
 */
async function draw(row: Row, variant: Variant): Promise<CellResult> {
  const probeServer = await startProbeMcpServer(variant);
  const sessionDir = await mkdtemp(join(tmpdir(), "schema-compat-probe-"));
  const instructionsFile = join(sessionDir, "instructions.md");

  try {
    await writeFile(instructionsFile, PROBE_INSTRUCTIONS, "utf8");

    const args = row.transport.buildTurnArgs({
      instructions: PROBE_INSTRUCTIONS,
      instructionsFile,
      mcpUrl: probeServer.url,
      model: row.model,
    });
    const stdout = await spawnAgentCli(row.transport, args, variant.prompt, {
      cwd: sessionDir,
      stepBudget: STEP_BUDGET,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const input = probeServer.calls[0];

    if (input == null) {
      return {
        status: "no-call",
        detail: truncate(row.transport.parseStream(stdout).text),
      };
    }

    return {
      status: variant.check(input) ? "ok" : "wrong-shape",
      detail: truncate(JSON.stringify(input)),
    };
  } finally {
    await probeServer.close();
    await rm(sessionDir, { recursive: true, force: true });
  }
}

/**
 * Resolve a provider/model argument to its agent-CLI transport.
 * @param modelArg - provider/model string
 * @returns The row context for that model
 */
function prepareRow(modelArg: string): Promise<Row> {
  const { provider, model } = parseModelArg(modelArg);

  return Promise.resolve({
    transport: requireAgentCliTransport(provider),
    model,
  });
}

/**
 * Select the variants to probe, honouring any --variant=id flags.
 * @returns The variants to run
 * @throws Error when a --variant names nothing in the corpus
 */
function selectedVariants(): Variant[] {
  const wanted = process.argv
    .filter((a) => a.startsWith("--variant="))
    .map((a) => a.slice("--variant=".length));

  if (wanted.length === 0) return VARIANTS;

  const chosen = VARIANTS.filter((v) => wanted.includes(v.id));

  if (chosen.length !== wanted.length) {
    const known = VARIANTS.map((v) => v.id).join(", ");

    throw new Error(`Unknown --variant. Known variants: ${known}`);
  }

  return chosen;
}

const models = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const repeats = Math.max(1, Math.floor(numArg("--repeat=") ?? 1));

await runProbeMatrix<Row>({
  modelArgs: models.length > 0 ? models : DEFAULT_MODELS,
  variants: selectedVariants(),
  repeats,
  settings: [
    `Transport: agent CLI over MCP | repeats: ${repeats} ` +
      `(cell shows worst of N draws)`,
    "Tool choice: the CLI's own (no forced call) — a no-call means it chatted.",
  ],
  prepareRow,
  draw,
});
