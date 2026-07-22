// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the user-authored custom-skills collection
// (~/.producer-pal/skills-custom/<slug>.md) — a thin binding of the generic
// collection-route factory to the custom-skills store. Like memory but with the
// per-entry `enabled` toggle this collection carries (round-tripped through the
// PUT body); the webui manager lists (GET), saves (PUT), and deletes (DELETE).

import { type Express } from "express";
import {
  customSkillExists,
  forgetCustomSkill,
  listCustomSkills,
  rememberCustomSkill,
  slugifyCustomSkillName,
} from "../helpers/skills-custom/custom-skills-store.ts";
import { registerCollectionRoutes } from "./collection-route.ts";

/**
 * Register the /custom-skills collection REST endpoints on the Express app.
 * @param app - Express application
 */
export function registerCustomSkillsCollectionRoutes(app: Express): void {
  registerCollectionRoutes(app, {
    basePath: "/custom-skills",
    noun: "custom skill",
    list: listCustomSkills,
    exists: customSkillExists,
    slugify: slugifyCustomSkillName,
    forget: forgetCustomSkill,
    remember: rememberCustomSkill,
    buildInput: (name, reqBody) => {
      if (typeof reqBody.content !== "string") {
        return { error: "content must be a string" };
      }

      return {
        name,
        description:
          typeof reqBody.description === "string" ? reqBody.description : "",
        body: reqBody.content,
        // Omitting `enabled` preserves the stored flag (or defaults to enabled
        // on create); only a real boolean from the toggle overrides it.
        enabled:
          typeof reqBody.enabled === "boolean" ? reqBody.enabled : undefined,
      };
    },
  });
}
