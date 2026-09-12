// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Vitest setup file: prints a line whenever an e2e test needed a retry to
 * pass. `retry: 1` in the e2e config hides a flaky failure by rerunning it,
 * which is fine for a dropped connection but would also hide a device that
 * actually died — this makes the rerun show up in the console instead of
 * disappearing into a green run.
 */
import { afterEach } from "vitest";

afterEach((context) => {
  const retryCount = context.task.result?.retryCount ?? 0;

  if (retryCount > 0) {
    console.warn(
      `RETRIED: "${context.task.name}" passed only after ${retryCount} ` +
        "retry(ies). Investigate if this happens often.",
    );
  }
});
