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
import { resolveEnabledTools } from "#src/shared/config.ts";
import { DEFAULT_NOTATION, isNotation } from "#src/shared/notation.ts";
import { assembleSkills } from "#src/skills/build-skills.ts";
import { resolveFragmentAlias } from "#src/skills/builtin-fragments.ts";
import { readSkillOverrides } from "../helpers/skill-overrides-store.ts";

/**
 * Register the GET /skills-preview endpoint on the Express app. Query params
 * `notation` (defaults to bar|beat when absent/invalid) and `smallModel`
 * (`"true"` enables basic/small-model skills) select the combination. The
 * response carries the assembled blob, the two slot names the COMBINATION picks
 * (the driver and the notation head — every other fragment is named by the
 * driver's own manifest, which the user can read in the editor), the fragments
 * the toolset `dropped`, and any assembly `warnings` (unknown fragments, refused
 * nesting, unsafe refs in a user override) so the editor can flag a broken
 * override instead of showing a truncated blob. Read-only, so it is not
 * origin-gated (unlike the override writes) — it exposes nothing a GET
 * /skill-overrides didn't already.
 *
 * Tool gating follows the same two-step the real request path uses: the device's
 * whitelist, minus whatever the caller lists in `disabledTools` (the query-param
 * twin of the chat's disabled-tools header). `allTools=true` skips gating
 * altogether, for previewing every fragment regardless of toolset.
 *
 * @param app - Express application
 * @param getTools - Reads the device's tool whitelist; omit for no tool gating
 */
export function registerSkillsPreviewRoute(
  app: Express,
  getTools?: () => readonly string[],
): void {
  app.get("/skills-preview", (req: Request, res: Response): void => {
    // Overrides can change on the device/filesystem between calls — never cache.
    res.set("Cache-Control", "no-store");

    const notationParam = req.query.notation;
    const notation = isNotation(notationParam)
      ? notationParam
      : DEFAULT_NOTATION;
    const smallModelMode = req.query.smallModel === "true";

    // The two slots the COMBINATION selects, for the editor's label: the driver
    // root (whose manifest names every other fragment) and the notation head it
    // pulls in. The alias folds midi-json's level-suffixed ref onto its one
    // head, so the label always names a real override slot.
    const driver = smallModelMode ? "basic" : "standard";
    // The driver root's name doubles as the depth suffix on the notation head.
    const head = resolveFragmentAlias(`${notation}-${driver}`);
    // Collect assembly warnings (unknown fragments, refused nesting, unsafe
    // refs) so the editor can surface a broken override instead of showing a
    // silently truncated blob.
    const warnings: string[] = [];
    const { skills, dropped } = assembleSkills(
      { notation, smallModelMode, tools: previewTools(req, getTools) },
      readSkillOverrides(),
      (message) => warnings.push(message),
    );

    res.json({
      notation,
      smallModelMode,
      head,
      driver,
      skills,
      dropped,
      warnings,
    });
  });
}

// --- Helpers below main export ---

/**
 * The toolset to gate this preview on: the device whitelist minus the caller's
 * `disabledTools`, or undefined (no gating) when it asked for `allTools` — or
 * when there is no whitelist to subtract from.
 * @param req - The preview request
 * @param getTools - Reads the device's tool whitelist
 * @returns The tools to assemble for, or undefined for no gating
 */
function previewTools(
  req: Request,
  getTools?: () => readonly string[],
): string[] | undefined {
  if (req.query.allTools === "true") return undefined;

  const configured = getTools?.();

  if (configured == null) return undefined;

  const disabled = req.query.disabledTools;

  return resolveEnabledTools(
    typeof disabled === "string" ? disabled : undefined,
    configured,
  );
}
