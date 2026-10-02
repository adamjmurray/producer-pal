// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The Node-side custom-skills routes: the shared collection quartet
 * (rpc/collection-node-routes.ts) bound to the custom-skills store, reaching
 * ~/.producer-pal/skills-custom/. Imported for side effects from mcp-server.ts
 * so the routes exist before V8 issues its first node_request.
 *
 * Sibling of memory-node-routes.ts, but user-authored instruction packs rather
 * than remembered facts. Enable and disable is a user action (webui /
 * hand-edit), not an assistant one, so these routes never flip the `enabled`
 * flag — `remember` preserves it.
 */

import { makeCollectionNodeRoutes } from "../../rpc/collection-node-routes.ts";
import {
  forgetCustomSkill,
  readCustomSkill,
  regenerateSkillsIndex,
  rememberCustomSkill,
} from "./custom-skills-store.ts";

/**
 * Register the `skills.read` / `skills.remember` / `skills.forget` /
 * `skills.list` routes. The underlying registry throws on duplicate
 * registration, so call once.
 */
export const registerCustomSkillsNodeRoutes = makeCollectionNodeRoutes({
  namespace: "skills",
  noun: "custom skill",
  emptyIndex: "(no custom skills)",
  missingDeleteNote: (name) => `No custom skill to delete for "${name}".`,
  read: readCustomSkill,
  remember: rememberCustomSkill,
  forget: forgetCustomSkill,
  regenerateIndex: regenerateSkillsIndex,
});
