// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** What readDevice resolved its `include` list and `maxDepth` into. */
export interface ReadOptions {
  includeChains: boolean;
  includeReturnChains: boolean;
  includeDrumPads: boolean;
  includeDrumMap: boolean;
  includeParams: boolean;
  includeParamValues: boolean;
  includeSample: boolean;
  includeOptions: boolean;
  includeActions: boolean;
  chainsHidden: boolean;
  maxDepth: number;
  paramSearch?: string;
}
