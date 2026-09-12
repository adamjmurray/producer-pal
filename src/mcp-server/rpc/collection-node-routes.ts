// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The read/remember/forget/list RPC quartet every markdown collection exposes to
 * V8. `ppal-context` runs in V8, which has no filesystem, so its collection ops
 * round-trip through Node to reach ~/.producer-pal/<subdir>/. Memory and custom
 * skills are both bindings of this factory (memory-node-routes.ts,
 * custom-skills-node-routes.ts) — the wording the assistant reads is the only
 * thing that differs, so it comes in as config rather than a second copy.
 *
 * Every mutating route echoes back the freshly regenerated index so the
 * assistant always sees the current list.
 */

import { registerNodeRoute } from "./node-request-protocol.ts";
import { optionalString, requireString } from "./route-args.ts";

/** Result shape shared by every collection route: a text payload for the LLM. */
interface CollectionRouteResult {
  content: string;
}

/** What a route needs off a stored entry. */
interface CollectionRouteEntry {
  name: string;
  body: string;
}

/** What the remember route writes; each store accepts at least these. */
interface CollectionRouteInput {
  name: string;
  description: string;
  body: string;
}

/** One collection's RPC namespace, store bindings, and user-facing wording. */
export interface CollectionNodeRoutesConfig {
  /** RPC name prefix, e.g. "memory" ⇒ `memory.read`. */
  namespace: string;
  /** Lowercase noun in route replies, e.g. "memory" or "custom skill". */
  noun: string;
  /** Stand-in index text when the collection is empty. */
  emptyIndex: string;
  /** Reply when a forget found nothing (the two collections word this differently). */
  missingDeleteNote: (name: string) => string;
  /** Read one entry by name, or null when absent. */
  read: (name: string) => CollectionRouteEntry | null;
  /** Create or overwrite an entry, returning the stored one. */
  remember: (input: CollectionRouteInput) => CollectionRouteEntry;
  /** Delete an entry; false when there was nothing to delete. */
  forget: (name: string) => boolean;
  /** Rebuild the derived index from the files on disk; "" when empty. */
  regenerateIndex: () => string;
}

/**
 * Build one collection's route registrar. The returned function registers
 * `<namespace>.read` / `.remember` / `.forget` / `.list`; the underlying registry
 * throws on duplicate registration, so call it once.
 *
 * @param config - The collection's namespace, store bindings, and wording
 * @returns A function that registers the four routes
 */
export function makeCollectionNodeRoutes(
  config: CollectionNodeRoutesConfig,
): () => void {
  const currentIndex = (): string =>
    config.regenerateIndex() || config.emptyIndex;

  const readRoute = (args: unknown): CollectionRouteResult => {
    const name = requireString(args, "name");
    const entry = config.read(name);

    return {
      content: entry ? entry.body : `No ${config.noun} found for "${name}".`,
    };
  };

  const rememberRoute = (args: unknown): CollectionRouteResult => {
    const entry = config.remember({
      name: requireString(args, "name"),
      description: optionalString(args, "description"),
      body: requireString(args, "content"),
    });

    return {
      content: `Saved ${config.noun} "${entry.name}".\n\n${currentIndex()}`,
    };
  };

  const forgetRoute = (args: unknown): CollectionRouteResult => {
    const name = requireString(args, "name");
    const note = config.forget(name)
      ? `Deleted ${config.noun} "${name}".`
      : config.missingDeleteNote(name);

    return { content: `${note}\n\n${currentIndex()}` };
  };

  return () => {
    registerNodeRoute(`${config.namespace}.read`, readRoute);
    registerNodeRoute(`${config.namespace}.remember`, rememberRoute);
    registerNodeRoute(`${config.namespace}.forget`, forgetRoute);
    registerNodeRoute(`${config.namespace}.list`, () => ({
      content: currentIndex(),
    }));
  };
}
