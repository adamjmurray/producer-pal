// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Sidecar files for offline re-judging. One file per result and judge, at
 * `<runDir>/judges/<judge-slug>/<result-file-name>`. The saved result is never
 * changed.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type ThinkingLevel } from "#evals/chat/shared/types.ts";
import { JUDGE_SYSTEM_PROMPT } from "#evals/scenarios/assertions/llm-judge.ts";

/** Folder inside a run directory that holds the sidecars. */
export const SIDECAR_DIR = "judges";

/** One judge's verdict on one saved result. */
export interface SidecarVerdict {
  version: 1;
  /** The result file, relative to the results directory */
  file: string;
  scenarioId: string;
  /** Names the sidecar folder; see `judgeSlug` */
  slug: string;
  /** The judge asked for, the model it resolved to, and its thinking level */
  judge: {
    provider: string;
    requestedModel?: string;
    model?: string;
    /** Absent when no `--judge-thinking` was given */
    thinking?: ThinkingLevel;
  };
  /** Hash of the criteria the judge was given; see `criteriaHash` */
  criteriaHash: string;
  judgedAt: string;
  durationMs: number;
  /** The result's gating checks passed */
  checksPass: boolean;
  pass: boolean;
  issues: string[];
}

/**
 * Turn a judge spec into a folder name. A thinking level is part of the
 * identity: the same judge at another level gets its own folder. No level
 * keeps the bare name, so verdicts saved before this existed still match.
 *
 * @param spec - "provider/model" or a slug that is already one (a slug may
 *   already end in "~level")
 * @param thinking - The judge's thinking level, when one was set
 * @returns The slug, e.g. "codex-code_luna" or "codex-code_luna~high"
 */
export function judgeSlug(spec: string, thinking?: ThinkingLevel): string {
  const slug = spec.replaceAll(/[^A-Za-z0-9._~-]/g, "_");

  return thinking == null ? slug : `${slug}~${thinking}`;
}

/**
 * Short fingerprint of what the judge was told: the shared system prompt and
 * the scenario's criteria. Changing either makes old verdicts stale.
 *
 * @param criteria - The scenario's llm_judge prompt
 * @param systemPrompt - The judge's system prompt
 * @returns First 12 hex digits of the SHA-256
 */
export function criteriaHash(
  criteria: string,
  systemPrompt: string = JUDGE_SYSTEM_PROMPT,
): string {
  return createHash("sha256")
    .update(systemPrompt)
    .update("\0")
    .update(criteria)
    .digest("hex")
    .slice(0, 12);
}

/**
 * Where a verdict is stored.
 *
 * @param resultsDir - The results directory
 * @param file - The result file, relative to the results directory
 * @param slug - The judge slug
 * @returns The sidecar path
 */
export function sidecarPath(
  resultsDir: string,
  file: string,
  slug: string,
): string {
  return join(resultsDir, dirname(file), SIDECAR_DIR, slug, basename(file));
}

/**
 * Read a verdict. One made against other criteria does not count.
 *
 * @param resultsDir - The results directory
 * @param file - The result file, relative to the results directory
 * @param slug - The judge slug
 * @param criteria - The current criteria; a verdict for other criteria is
 *   treated as missing
 * @returns The verdict, or undefined when missing, unreadable or out of date
 */
export async function readSidecar(
  resultsDir: string,
  file: string,
  slug: string,
  criteria: string,
): Promise<SidecarVerdict | undefined> {
  try {
    const text = await readFile(sidecarPath(resultsDir, file, slug), "utf8");
    const verdict = JSON.parse(text) as SidecarVerdict;

    return verdict.criteriaHash === criteriaHash(criteria) &&
      typeof verdict.pass === "boolean"
      ? verdict
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write a verdict, creating its folder.
 *
 * @param resultsDir - The results directory
 * @param verdict - The verdict to store
 */
export async function writeSidecar(
  resultsDir: string,
  verdict: SidecarVerdict,
): Promise<void> {
  const path = sidecarPath(resultsDir, verdict.file, verdict.slug);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(verdict, null, 2) + "\n");
}
