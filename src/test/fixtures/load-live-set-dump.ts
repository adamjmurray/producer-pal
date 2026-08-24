// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Loads the checked-in Live Set dump — a real Ableton Live Set walked by
 * scripts/live-api/dump-live-set and stored gzipped (~740 KB, 13 MB of JSON).
 *
 * The Set behind it is deliberately extreme: four drum racks, an instrument
 * rack nested four levels deep, rack return chains, take lanes, and both
 * session and arrangement clips. It exists so object-build budgets are measured
 * against shapes a real Set produces rather than shapes a hand-written mock
 * happens to cover.
 *
 * Regenerate against a running Live with the Set open. Keep all three roots:
 * tools resolve this_device and live_app directly, and a live_set-only walk
 * leaves them unresolvable.
 *   node scripts/live-api/dump-live-set/dump-live-set.ts \
 *     src/test/fixtures/live-set-dump.json --gzip --max-objects=200000 \
 *     --root=live_set --root=this_device --root=live_app
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { type LiveSetDump } from "../../../scripts/live-api/dump-live-set/dump-types.ts";

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "live-set-dump.json.gz",
);

// Parsing costs ~40ms, so it is done once. Vitest isolates modules per test
// file, so this cache never crosses files — but within one file every caller
// shares the object. Treat it as read-only.
let cached: LiveSetDump | null = null;

/**
 * Load the Live Set dump fixture
 * @returns The parsed dump, shared between callers in the same test file
 */
export function loadLiveSetDump(): LiveSetDump {
  cached ??= JSON.parse(
    gunzipSync(readFileSync(FIXTURE_PATH)).toString("utf8"),
  ) as LiveSetDump;

  return cached;
}
