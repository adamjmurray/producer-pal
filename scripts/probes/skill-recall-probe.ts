#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Skill recall probe: check that every fragment, tool description and param
 * description still reaches the model where we currently put it.
 *
 * Moving an `@include` can cost the model a whole fragment even though the text
 * is still in the blob — that is what `feac7199b` did to `swing()`, `quant()`
 * and `step()`, and only a 4-hour eval run caught it. This asks one question
 * per source instead, and answers in about a minute.
 *
 * It needs NO Ableton. The tool schemas come from the real `createMcpServer`
 * with a stub Live API behind it, and every transport connects to that same
 * server — so an AI-SDK model and codex-cli see identical schemas, and a
 * difference in results is the model rather than the harness.
 *
 * It catches content LOSS, not bad behavior. A model can recall `legato(tol)`
 * perfectly and still never use it; that is what the eval suite is for.
 *
 * Usage:
 *   npm run probe:skills
 *   npm run probe:skills -- -m codex-code/luna          # the model we eval
 *   npm run probe:skills -- -m local/google/gemma-4-26b-a4b
 *   npm run probe:skills -- --small-model               # basic tier
 *   npm run probe:skills -- --surface param             # param descriptions
 *   npm run probe:skills -- -t transforms-expressions   # one source
 *
 * Exits non-zero if any probe misses, so it works as a gate.
 */

import { Command } from "commander";
import { getAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { parseModelArg } from "#evals/shared/parse-model-arg.ts";
import { type Notation } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import {
  type AskContext,
  askViaAgentCli,
  askViaAiSdk,
} from "./skill-recall-ask.ts";
import {
  SKILL_RECALL_PROBES,
  type SkillRecallProbe,
} from "./skill-recall-probes.ts";
import { startSkillProbeServer } from "./skill-recall-server.ts";

interface ProbeOutcome {
  probe: SkillRecallProbe;
  reply: string;
  missing: RegExp[];
}

/**
 * Run the probe set and report which sources failed to come through.
 *
 * @returns Nothing; exits non-zero when a probe misses.
 */
async function main(): Promise<void> {
  const program = new Command()
    .name("probe:skills")
    .description("Check that each fragment / tool / param reaches the model")
    .option("-m, --model <provider/model>", "Model", "google/gemini-3.6-flash")
    .option("-t, --test <source>", "Probe one source only")
    .option("--small-model", "Probe the basic driver instead of the standard")
    .option("--surface <kind>", "Only skill | tool | param probes")
    .option("--notation <name>", "Notation to assemble with", "barbeat")
    .parse();

  const options = program.opts();
  const spec = parseModelArg(options.model);
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

  const notation = options.notation as Notation;
  const smallModelMode = tier === "basic";
  const server = await startSkillProbeServer({ notation, smallModelMode });
  const context: AskContext = {
    skills: buildSkills({ notation, smallModelMode }),
    mcpUrl: server.url,
    spec,
  };
  // Agent CLIs spawn a subprocess per question and rate-limit under load, so
  // they go one at a time; AI SDK providers are fine in parallel.
  const viaAgentCli = getAgentCliTransport(spec.provider) != null;

  console.log(
    `${probes.length} probe(s) · ${tier} tier · ${options.notation} · ${options.model}`,
  );
  console.log(
    `context: ${context.skills.length} chars of skills + tool schemas from ${server.url}\n`,
  );

  try {
    const outcomes = viaAgentCli
      ? await runSerially(probes, context)
      : await Promise.all(
          probes.map((probe) => runProbe(probe, context, false)),
        );

    reportOutcomes(outcomes);
  } finally {
    await server.close();
  }
}

/**
 * Run probes one at a time, for transports that cannot take parallel load.
 *
 * @param probes - The probes to run
 * @param context - Skills, probe server URL, and model spec
 * @returns Each probe's outcome, in order
 */
async function runSerially(
  probes: SkillRecallProbe[],
  context: AskContext,
): Promise<ProbeOutcome[]> {
  const outcomes: ProbeOutcome[] = [];

  for (const probe of probes) {
    const outcome = await runProbe(probe, context, true);

    console.log(
      `  ${outcome.missing.length === 0 ? "PASS" : "MISS"}  ${probe.surface.padEnd(6)} ${probe.source}`,
    );
    outcomes.push(outcome);
  }

  return outcomes;
}

/**
 * Ask one probe question and score the reply.
 *
 * @param probe - The question and its expected patterns
 * @param context - Skills, probe server URL, and model spec
 * @param viaAgentCli - Whether this model needs the agent-CLI transport
 * @returns The reply and any patterns it failed to match
 */
async function runProbe(
  probe: SkillRecallProbe,
  context: AskContext,
  viaAgentCli: boolean,
): Promise<ProbeOutcome> {
  try {
    const ask = viaAgentCli ? askViaAgentCli : askViaAiSdk;
    const text = await ask(probe.question, context);

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
 * Print the per-source result table and exit non-zero on any miss.
 *
 * @param outcomes - Every probe's reply and missing patterns
 */
function reportOutcomes(outcomes: ProbeOutcome[]): void {
  const failed = outcomes.filter((outcome) => outcome.missing.length > 0);

  console.log();

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
