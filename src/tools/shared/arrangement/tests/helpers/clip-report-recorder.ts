// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipReporter } from "../../helpers/clip-reporter.ts";

/** One thing a shared arrangement step said about a clip. */
export interface ClipReport {
  kind: "note" | "refuse";
  clipId: string;
  reason: string;
}

/**
 * A reporter that keeps what it's told, standing in for the collector the clip
 * tools pass in.
 * @returns The reports so far, and the reporter to put on the context
 */
export function recordClipReports(): {
  reports: ClipReport[];
  reportClip: ClipReporter;
} {
  const reports: ClipReport[] = [];

  return {
    reports,
    reportClip: {
      note: (clipId, reason) => reports.push({ kind: "note", clipId, reason }),
      refuse: (clipId, reason) =>
        reports.push({ kind: "refuse", clipId, reason }),
    },
  };
}
