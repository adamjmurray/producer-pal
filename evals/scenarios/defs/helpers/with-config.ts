// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Run a scenario `setup` step under a temporary server config. The model's
 * tools are listed before `setup` runs, so it never sees what is switched on
 * or off here.
 */

import {
  getLiveApiEnabled,
  getSmallModelMode,
  setConfig,
} from "#evals/shared/config.ts";

/** The switches a setup step may flip for its own calls. */
export interface TemporaryConfig {
  liveApiEnabled?: boolean;
  smallModelMode?: boolean;
}

/**
 * Run a callback with the given config, then put it back as found, even if the
 * callback throws. Only the switches named in `config` are touched.
 *
 * @param config - The values to hold while `run` runs
 * @param run - What to do under that config
 * @returns Whatever `run` returns
 */
export async function withConfig<T>(
  config: TemporaryConfig,
  run: () => Promise<T>,
): Promise<T> {
  const previous: TemporaryConfig = {};

  if (config.liveApiEnabled != null) {
    previous.liveApiEnabled = await getLiveApiEnabled();
  }

  if (config.smallModelMode != null) {
    previous.smallModelMode = await getSmallModelMode();
  }

  await setConfig(config);

  try {
    return await run();
  } finally {
    await setConfig(previous);
  }
}
