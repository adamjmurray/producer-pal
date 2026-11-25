// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";

/** What an install script says, and whether it worked. */
export interface InstallReport {
  lines: string[];
  ok: boolean;
}

/**
 * Run an install command: print its report and set the exit code, or print
 * the error and exit 1 if it throws.
 *
 * @param install - Does the install and describes what happened
 */
export async function runInstallReport(
  install: () => Promise<InstallReport> | InstallReport,
): Promise<void> {
  try {
    const { lines, ok } = await install();

    for (const line of lines) {
      console.log(line);
    }

    process.exitCode = ok ? 0 : 1;
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
