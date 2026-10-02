// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Vitest setup file: prints a line when an e2e test passed only on a retry,
 * so a flaky pass shows in the console instead of vanishing into a green run.
 * A failed retry prints nothing extra; the failure already shows.
 */
import { afterEach } from "vitest";

afterEach((context) => {
  // Vitest sets this attempt's pass/fail before afterEach runs.
  const { retryCount = 0, state } = context.task.result ?? {};

  if (retryCount > 0 && state === "pass") {
    console.warn(
      `RETRIED: "${context.task.name}" passed only after ${retryCount} ` +
        "retry(ies). Investigate if this happens often.",
    );
  }
});
