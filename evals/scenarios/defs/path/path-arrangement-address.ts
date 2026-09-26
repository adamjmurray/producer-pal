// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: an arrangement path IS a clip address.
 *
 * Creating an arrangement clip returns `path: "t3[1|1]"` alongside its id, and
 * both spellings reach the clip — pasting the path straight back into
 * update-clip renames it, which is the round trip ADR-0037 exists to close.
 * This grades the rename landing, whichever spelling the model reaches for.
 */

import { type EvalScenario } from "../../types.ts";
import { arrangementRenameScenario } from "../helpers/arrangement-rename-scenario.ts";

const CLIP_NAME = "Verse Lead";

export const pathArrangementAddress: EvalScenario = arrangementRenameScenario({
  id: "path-arrangement-address",
  description: "Act on an arrangement clip by the id or path it reports",
  renameMessage: `Rename that arrangement clip to "${CLIP_NAME}".`,
  name: CLIP_NAME,
  maxTokens: 3_000,
});
