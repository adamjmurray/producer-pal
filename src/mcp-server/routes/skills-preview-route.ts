// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Read-only REST endpoint that assembles the exact "# Producer Pal Skills" blob
// ppal-connect would return for a given notation + small-model combination,
// with the user's fragment overrides (~/.producer-pal/skills) applied. The webui
// context editor's Skills "Preview" view fetches this to show what any of the
// six combinations produces, so users can review (and size) the instructions the
// model actually receives. Assembly must happen Node-side because the override
// files are only readable here (V8 has no filesystem) — the same reason
// skills-inject.ts assembles the live blob rather than the V8 connect() handler.

import { type Express, type Request, type Response } from "express";
import { DEFAULT_NOTATION, isNotation } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { readSkillOverrides } from "../helpers/skill-overrides-store.ts";

/**
 * Register the GET /skills-preview endpoint on the Express app. Query params
 * `notation` (defaults to bar|beat when absent/invalid) and `smallModel`
 * (`"true"` enables basic/small-model skills) select the combination. The
 * response carries the assembled blob, the two active slot names (so the editor
 * can label which fragments a combination uses without re-deriving the selection
 * logic), and any assembly `warnings` (cycles/unsafe refs in a user override) so
 * the editor can flag a broken override instead of showing a truncated blob.
 * Read-only, so it is not origin-gated (unlike the override writes) — it exposes
 * nothing a GET /skill-overrides didn't already.
 *
 * @param app - Express application
 */
export function registerSkillsPreviewRoute(app: Express): void {
  app.get("/skills-preview", (req: Request, res: Response): void => {
    // Overrides can change on the device/filesystem between calls — never cache.
    res.set("Cache-Control", "no-store");

    const notationParam = req.query.notation;
    const notation = isNotation(notationParam)
      ? notationParam
      : DEFAULT_NOTATION;
    const smallModelMode = req.query.smallModel === "true";

    // The two overridable slots this combo composes, for the editor's label: the
    // driver root (which inlines the core) and the notation head it pulls in.
    // midi-json is level-invariant, so its head has no suffix.
    const driver = smallModelMode ? "basic" : "standard";
    const head =
      notation === "midi-json"
        ? "midi-json"
        : `${notation}-${smallModelMode ? "basic" : "standard"}`;
    // Collect assembly warnings (override cycles, unsafe/too-deep refs) so the
    // editor can surface a broken override instead of showing a silently
    // truncated blob.
    const warnings: string[] = [];
    const skills = buildSkills(
      { notation, smallModelMode },
      readSkillOverrides(),
      (message) => warnings.push(message),
    );

    res.json({ notation, smallModelMode, head, driver, skills, warnings });
  });
}
