// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Lookup table from Ableton Live clip gain (529 samples)
// Extended 2026-02-03 with low-range samples (-69.7 to -65.7 dB)
// Data lives in the sibling .json file so table diffs stay readable.

import lookupTableData from "./lookup-table.json" with { type: "json" };

export interface LookupEntry {
  gain: number;
  dB: number | null;
}

export const LOOKUP_TABLE: LookupEntry[] = lookupTableData;
