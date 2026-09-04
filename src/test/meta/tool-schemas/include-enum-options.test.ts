// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { publishedEnumValues } from "#src/test/helpers/enum-options-test-helpers.ts";
import { toolDefReadClip } from "#src/tools/clip/read/read-clip.def.ts";
import { toolDefReadLiveSet } from "#src/tools/live-set/read-live-set.def.ts";
import { toolDefReadScene } from "#src/tools/scene/read-scene.def.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { ALL_INCLUDE_OPTIONS } from "#src/tools/shared/tool-framework/include-params.ts";
import { toolDefReadTrack } from "#src/tools/track/read/read-track.def.ts";

// Two lists say what a read tool's `include` accepts: the enum in its `.def.ts`
// (what validates the call) and ALL_INCLUDE_OPTIONS (what '*' expands to). When
// they drift, an option is reachable by wildcard and rejected by name — which is
// exactly what `warp` did on read-track.
const CASES: [toolType: string, def: ToolDefFunction][] = [
  ["song", toolDefReadLiveSet],
  ["track", toolDefReadTrack],
  ["scene", toolDefReadScene],
  ["clip", toolDefReadClip],
];

describe("read tool include enums", () => {
  it.each(CASES)(
    "%s publishes exactly its option list plus '*'",
    (toolType, def) => {
      const options = ALL_INCLUDE_OPTIONS[toolType] ?? [];

      expect(options.length).toBeGreaterThan(0);
      expect(publishedEnumValues(def, "include").toSorted()).toStrictEqual(
        [...options, "*"].toSorted(),
      );
    },
  );
});
