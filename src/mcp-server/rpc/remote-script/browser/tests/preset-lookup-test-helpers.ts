// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Opus 5.5 (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, vi } from "vitest";
import { findPresetFiles } from "../../../../live-library/query/preset-files.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  type ReceivedRequest,
  startFakeRemoteScript,
} from "../../tests/remote-script-test-helpers.ts";

export interface PresetLookupStandIn {
  /** Starts a stand-in remote script that closes after the test. */
  start: (
    answer: (request: ReceivedRequest) => FakeAnswer,
  ) => Promise<FakeRemoteScript>;
  /** The stand-in this test started, if any. */
  current: () => FakeRemoteScript | undefined;
}

/**
 * Before each test, the library finds no presets (the caller must vi.mock
 * preset-files.ts); after it, the stand-in remote script closes.
 * @returns Starts and reads this test's stand-in
 */
export function usePresetLookupStandIn(): PresetLookupStandIn {
  let fake: FakeRemoteScript | undefined;

  beforeEach(() => {
    vi.mocked(findPresetFiles).mockReset();
    vi.mocked(findPresetFiles).mockResolvedValue(null);
  });

  afterEach(async () => {
    await fake?.close();
    fake = undefined;
  });

  return {
    start: async (answer) => {
      fake = await startFakeRemoteScript(answer);

      return fake;
    },
    current: () => fake,
  };
}
