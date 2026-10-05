// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A log of which tools ran through the pipeline, for the meta test that holds
// every write tool to it. Off outside tests, so production keeps nothing.

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
