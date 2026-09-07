#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Skill recall probe: check that every fragment still reaches the model where
 * the driver currently includes it.
 *
 * Moving an `@include` can cost the model a whole fragment's content even
 * though the text is still in the blob — that is what `feac7199b` did to
 * `swing()`, `quant()` and `step()`, and only a 4-hour eval run caught it. This
 * asks one question per fragment instead, and answers in about a minute.
 *
 * It needs NO Ableton and no MCP server: `buildSkills()` is a pure function, so
 * this is just the real blob plus one chat turn per probe. Agent-CLI providers
 * (codex-code, claude-code) are not supported for that reason — they only run
 * against a live MCP connection.
 *
 * It catches fragment LOSS, not bad behavior. A model can recall `legato(tol)`
 * perfectly and still never use it; that is what the eval suite is for.
 *
 * Usage:
 *   ./scripts/skill-probe                                  # standard tier
 *   ./scripts/skill-probe --small-model                    # basic tier
 *   ./scripts/skill-probe -m local/google/gemma-4-26b-a4b  # LM Studio, free
 *   ./scripts/skill-probe -t transforms-expressions        # one fragment
 *   ./scripts/skill-probe --notation stark
 *
 * Exits non-zero if any probe misses, so it works as a pre-commit gate.
 */

import { Command } from "commander";
import { generateText } from "ai";
import { createProviderModel } from "#evals/chat/provider.ts";
import { parseModelArg } from "#evals/shared/parse-model-arg.ts";
import { type Notation } from "#src/shared/notation.ts";
import {
  type ProbeContext,
  buildProbeContext,
} from "./skill-recall-context.ts";
import {
  SKILL_RECALL_PROBES,
  type SkillRecallProbe,
} from "./skill-recall-probes.ts";

/** Providers that need a live MCP connection, so cannot answer a bare prompt. */
const AGENT_CLI_PROVIDERS = new Set(["codex-code", "claude-code"]);

/** Keeps replies short: probes match tokens, and long answers only add cost. */
const SYSTEM_SUFFIX =
  "\n\nAnswer the next question as briefly as possible. No preamble, no explanation.";

interface ProbeOutcome {
  probe: SkillRecallProbe;
  reply: string;
  missing: RegExp[];
}

/**
 * Run the probe set and report which fragments failed to come through.
 *
 * @returns Nothing; exits non-zero when a probe misses.
 */
async function main(): Promise<void> {
  const program = new Command()
    .name("skill-probe")
    .description("Check that each skill fragment reaches the model")
    .option("-m, --model <provider/model>", "Model", "google/gemini-3.6-flash")
    .option("-t, --test <fragment>", "Probe one fragment only")
    .option("--small-model", "Probe the basic driver instead of the standard")
    .option("--surface <kind>", "Only skill | tool | param probes")
    .option("--notation <name>", "Notation to assemble with", "barbeat")
    .parse();

  const options = program.opts();
  const spec = parseModelArg(options.model);

  if (AGENT_CLI_PROVIDERS.has(spec.provider)) {
    program.error(
      `${spec.provider} drives a CLI that needs a live MCP connection. ` +
        `Probe with an API or local provider instead (e.g. -m local/<model>).`,
    );
  }

  const tier = options.smallModel ? "basic" : "standard";
  const probes = SKILL_RECALL_PROBES.filter(
    (probe) =>
      probe.tier === tier &&
      (options.test == null || probe.source === options.test) &&
      (options.surface == null || probe.surface === options.surface),
  );

  if (probes.length === 0) {
    program.error(`No ${tier}-tier probes match. Check -t against the driver.`);
  }

  const context = buildProbeContext({
    notation: options.notation as Notation,
    smallModelMode: tier === "basic",
  });
  const model = createProviderModel(spec.provider, spec.model);

  console.log(
    `${probes.length} probe(s) · ${tier} tier · ${options.notation} · ${options.model}`,
  );
  console.log(
    `context: ${context.skills.length} chars of skills + ${Object.keys(context.tools).length} tool schemas\n`,
  );

  const outcomes = await Promise.all(
    probes.map((probe) => runProbe(probe, context, model)),
  );

  reportOutcomes(outcomes);
}

/**
 * Ask one probe question against the assembled skills.
 *
 * @param probe - The question and its expected patterns
 * @param context - Skills blob and tool schemas, as a real session has them
 * @param model - AI SDK model to ask
 * @returns The reply and any patterns it failed to match
 */
async function runProbe(
  probe: SkillRecallProbe,
  context: ProbeContext,
  model: Parameters<typeof generateText>[0]["model"],
): Promise<ProbeOutcome> {
  try {
    // toolChoice "none" keeps the schemas in context without letting the model
    // answer by calling something — a probe wants the reply, not a tool call.
    const { text } = await generateText({
      model,
      instructions: context.skills + SYSTEM_SUFFIX,
      prompt: probe.question,
      tools: context.tools,
      toolChoice: "none",
    });

    return {
      probe,
      reply: text.trim(),
      missing: probe.expect.filter((pattern) => !pattern.test(text)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { probe, reply: `ERROR: ${message}`, missing: probe.expect };
  }
}

/**
 * Print the per-fragment result table and exit non-zero on any miss.
 *
 * @param outcomes - Every probe's reply and missing patterns
 */
function reportOutcomes(outcomes: ProbeOutcome[]): void {
  const failed = outcomes.filter((outcome) => outcome.missing.length > 0);

  for (const outcome of outcomes) {
    const ok = outcome.missing.length === 0;
    const oneLine = outcome.reply.replaceAll(/\s+/g, " ").slice(0, 70);

    console.log(
      `  ${ok ? "PASS" : "MISS"}  ${outcome.probe.surface.padEnd(6)} ${outcome.probe.source.padEnd(30)} ${oneLine}`,
    );
  }

  console.log(`\n${outcomes.length - failed.length}/${outcomes.length} passed`);

  if (failed.length > 0) {
    console.log("\nDid not come through:");

    for (const outcome of failed) {
      console.log(
        `  ${outcome.probe.source} — wanted ${outcome.missing.join(", ")}`,
      );
      console.log(`    asked: ${outcome.probe.question}`);
      console.log(`    got:   ${outcome.reply.replaceAll(/\s+/g, " ")}`);
    }

    console.log(
      "\nA skill miss usually means the fragment moved somewhere the model " +
        "stops reading it — check the include order in src/skills/drivers.ts. " +
        "A tool/param miss means the description is not landing; edit it and " +
        "re-probe.",
    );
    process.exit(1);
  }
}

await main();
