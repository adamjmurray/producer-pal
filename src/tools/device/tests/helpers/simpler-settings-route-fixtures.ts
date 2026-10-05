// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A stand-in for the remote script's Simpler pitch bend routes. The test file
// mocks node-request-v8-protocol.ts itself.

import { vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  SIMPLER_SETTINGS_ROUTES,
  type SimplerSettingsEntry,
  type SimplerWriteRequest,
} from "#src/tools/shared/remote-script/simpler-settings-contract.ts";

/** What the remote script says for one Simpler it was asked to read. */
export type SimplerReadEntry = SimplerSettingsEntry | { error: string };

/**
 * Have the remote script answer a read with one entry per Simpler asked about.
 * @param simplers - What it says about each
 */
export function remoteScriptReads(...simplers: SimplerReadEntry[]): void {
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result: { available: true, result: { simplers } },
  });
}

/**
 * Have the remote script take a write and read back these settings.
 * @param settings - What Live reads back after the write
 */
export function remoteScriptWrites(settings: SimplerSettingsEntry): void {
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result: { available: true, result: settings },
  });
}

/** One setting pair as the remote script spells it. */
export function bend(pitch: number, note: number): SimplerSettingsEntry {
  return { pitch_bend_range: pitch, note_pitch_bend_range: note };
}

/**
 * The paths each Simpler read asked about.
 * @returns One list per request
 */
export function simplerPathsRead(): unknown[] {
  return vi
    .mocked(requestNode)
    .mock.calls.filter(([route]) => route === SIMPLER_SETTINGS_ROUTES.read)
    .map(([, args]) => (args as { devicePaths: string[] }).devicePaths);
}

/**
 * The writes sent.
 * @returns One request per write
 */
export function simplerWritesSent(): SimplerWriteRequest[] {
  return vi
    .mocked(requestNode)
    .mock.calls.filter(([route]) => route === SIMPLER_SETTINGS_ROUTES.write)
    .map(([, args]) => args as SimplerWriteRequest);
}
