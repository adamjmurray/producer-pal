// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Register the Node-side custom-skills routes with the V8↔Node RPC dispatcher.
 * The `ppal-context` tool runs in V8, which has no filesystem, so its
 * `scope: "skills"` ops (read/remember/forget/list) round-trip through here to
 * reach ~/.producer-pal/skills-custom/. Imported for side effects from
 * mcp-server.ts so the routes exist before V8 issues its first node_request.
 *
 * Sibling of memory-node-routes.ts: same index-derived collection shape,
 * but user-authored instruction packs rather than remembered facts. Enable and
 * disable is a user action (webui / hand-edit), not an assistant one, so these
 * routes never flip the `enabled` flag — `remember` preserves it. Every mutating
 * route echoes back the freshly regenerated index so the assistant always sees
 * the current skill list. A later built-in skill-splitting effort can extend
 * `readRoute` to also resolve on-demand built-in specialized skills behind this
 * same route (resolve user skill first, then a built-in registry).
 */

import { registerNodeRoute } from "../../rpc/node-request-protocol.ts";
import { optionalString, requireString } from "../../rpc/route-args.ts";
import {
  forgetCustomSkill,
  readCustomSkill,
  regenerateSkillsIndex,
  rememberCustomSkill,
} from "./custom-skills-store.ts";

/** Result shape shared by every skills route: a text payload for the LLM. */
interface SkillsRouteResult {
  content: string;
}

/**
 * Register the `skills.read` / `skills.remember` / `skills.forget` /
 * `skills.list` routes. The underlying registry throws on duplicate
 * registration, so call once.
 */
export function registerCustomSkillsNodeRoutes(): void {
  registerNodeRoute("skills.read", readRoute);
  registerNodeRoute("skills.remember", rememberRoute);
  registerNodeRoute("skills.forget", forgetRoute);
  registerNodeRoute("skills.list", listRoute);
}

// --- Helpers below main export ---

/**
 * Read one custom skill's instruction body by name.
 *
 * @param args - Route args carrying the skill name
 * @returns The skill body, or a not-found note
 */
function readRoute(args: unknown): SkillsRouteResult {
  const name = requireString(args, "name");
  const entry = readCustomSkill(name);

  return {
    content: entry ? entry.body : `No custom skill found for "${name}".`,
  };
}

/**
 * Create or overwrite a custom skill, then echo the regenerated index. Preserves
 * the entry's enabled flag (create defaults to enabled).
 *
 * @param args - Route args (name, description, content=body)
 * @returns Confirmation plus the current index
 */
function rememberRoute(args: unknown): SkillsRouteResult {
  const entry = rememberCustomSkill({
    name: requireString(args, "name"),
    description: optionalString(args, "description"),
    body: requireString(args, "content"),
  });

  return {
    content: `Saved custom skill "${entry.name}".\n\n${currentIndex()}`,
  };
}

/**
 * Delete a custom skill (if present), then echo the regenerated index.
 *
 * @param args - Route args carrying the skill name
 * @returns Confirmation plus the current index
 */
function forgetRoute(args: unknown): SkillsRouteResult {
  const name = requireString(args, "name");
  const existed = forgetCustomSkill(name);
  const note = existed
    ? `Deleted custom skill "${name}".`
    : `No custom skill to delete for "${name}".`;

  return { content: `${note}\n\n${currentIndex()}` };
}

/**
 * Return the derived index, self-healing it from the files on disk.
 *
 * @returns The current skills index
 */
function listRoute(): SkillsRouteResult {
  return { content: currentIndex() };
}

/**
 * The current index markdown, with a friendly placeholder when empty.
 *
 * @returns The regenerated index, or an empty-collection note
 */
function currentIndex(): string {
  return regenerateSkillsIndex() || "(no custom skills)";
}
