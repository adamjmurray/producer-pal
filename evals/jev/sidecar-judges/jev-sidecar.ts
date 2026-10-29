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
  /** The judge asked for, and the model it resolved to */
  judge: { provider: string; requestedModel?: string; model?: string };
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
 * Turn a judge spec into a folder name.
 *
 * @param spec - "provider/model" or a slug that is already one
 * @returns The slug, e.g. "codex-code_luna"
 */
export function judgeSlug(spec: string): string {
  return spec.replaceAll(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * Short fingerprint of a criteria text.
 *
 * @param criteria - The scenario's llm_judge prompt
 * @returns First 12 hex digits of the SHA-256
 */
export function criteriaHash(criteria: string): string {
  return createHash("sha256").update(criteria).digest("hex").slice(0, 12);
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
