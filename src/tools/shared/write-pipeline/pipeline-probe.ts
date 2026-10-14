// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Test seams: a log of which tools ran through the pipeline (for the meta test
// that holds every write tool to it), and a settle fault for the conformance
// suite. Both are off outside tests, so production keeps nothing.

let log: string[] | null = null;

/** Start logging pipeline runs, discarding any earlier log. */
export function startPipelineProbe(): void {
  log = [];
}

/**
 * Stop logging.
 * @returns The tool of every run since the probe started
 */
export function stopPipelineProbe(): string[] {
  const runs = log ?? [];

  log = null;

  return runs;
}

/**
 * Note that a tool ran through the pipeline.
 * @param tool - The tool's name
 */
export function recordPipelineRun(tool: string): void {
  log?.push(tool);
}

let settleFault: Error | null = null;

/**
 * Make the next settle step throw this, after the tool's own settle has run.
 * For the conformance suite: no input makes a real settle throw.
 * @param error - What to throw
 */
export function armSettleFault(error: Error): void {
  settleFault = error;
}

/** Drop an armed settle fault that no call used. */
export function disarmSettleFault(): void {
  settleFault = null;
}

/** Throw the armed settle fault, once; do nothing when none is armed. */
export function throwSettleFault(): void {
  const fault = settleFault;

  settleFault = null;

  if (fault != null) {
    throw fault;
  }
}
