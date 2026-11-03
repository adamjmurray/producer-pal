// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The remember/list/readMany/forgetMany RPC routes every markdown collection
 * exposes to V8. `ppal-context` runs in V8, which has no filesystem, so its collection ops
 * round-trip through Node to reach ~/.producer-pal/<subdir>/. Memory and custom
 * skills are both bindings of this factory (memory-node-routes.ts,
 * custom-skills-node-routes.ts) — the wording the assistant reads is the only
 * thing that differs, so it comes in as config rather than a second copy.
 *
 * `remember` echoes back the freshly regenerated index so the assistant sees the
 * current list.
 */

import { errorMessage } from "#src/shared/error-message.ts";
import {
  namedAgain,
  replacementFailedDetail,
} from "#src/shared/max/named-again-wording.ts";
import { registerNodeRoute } from "./node-request-protocol.ts";
import {
  optionalString,
  requireString,
  requireStringArray,
} from "./route-string-args.ts";

/** Result shape shared by every collection route: a text payload for the LLM. */
interface CollectionRouteResult {
  content: string;
}

/**
 * One name's answer from a many-name route, in the name as the caller wrote it.
 * A name that couldn't be served has `ok: false`; one with nothing to do has a
 * `detail` and no `ok`.
 */
interface CollectionNameEntry {
  name: string;
  content?: string;
  ok?: false;
  detail?: string;
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
  /** RPC name prefix, e.g. "memory" ⇒ `memory.readMany`. */
  namespace: string;
  /** Lowercase noun in route replies, e.g. "memory" or "custom skill". */
  noun: string;
  /** Stand-in index text when the collection is empty. */
  emptyIndex: string;
  /** The name an entry is stored under, so two spellings of one can be told apart. */
  slugify: (name: string) => string;
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
 * `<namespace>.remember` / `.list` / `.readMany` / `.forgetMany`; the underlying
 * registry throws on duplicate registration, so call it once.
 *
 * @param config - The collection's namespace, store bindings, and wording
 * @returns A function that registers the routes
 */
export function makeCollectionNodeRoutes(
  config: CollectionNodeRoutesConfig,
): () => void {
  const currentIndex = (): string =>
    config.regenerateIndex() || config.emptyIndex;

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

  const readManyRoute = (
    args: unknown,
  ): { entries: CollectionNameEntry[] } => ({
    entries: requireStringArray(args, "names").map(
      (name): CollectionNameEntry => {
        try {
          const entry = config.read(name);

          return entry
            ? { name, content: entry.body }
            : {
                name,
                ok: false,
                detail: `No ${config.noun} found for "${name}".`,
              };
        } catch (error) {
          return { name, ok: false, detail: errorMessage(error) };
        }
      },
    ),
  });

  // A name given again later is deleted once, by its last mention; the earlier
  // ones say so and do nothing, and fail with the last one if it fails. A name
  // that throws costs only its own entry.
  const forgetManyRoute = (
    args: unknown,
  ): { entries: CollectionNameEntry[] } => {
    const names = requireStringArray(args, "names");
    const slugs = names.map((name) => config.slugify(name));
    const lastMention = (i: number): number =>
      slugs[i] === "" ? i : slugs.lastIndexOf(slugs[i] ?? "");

    const entries = names.map((name, i): CollectionNameEntry => {
      if (lastMention(i) !== i) {
        return { name, detail: namedAgain(`"${names[lastMention(i)]}"`) };
      }

      try {
        return config.forget(name)
          ? { name }
          : { name, detail: "nothing to delete" };
      } catch (error) {
        return { name, ok: false, detail: errorMessage(error) };
      }
    });

    return {
      entries: entries.map((entry, i) => {
        const last = lastMention(i);

        return last !== i && entries[last]?.ok === false
          ? {
              name: entry.name,
              ok: false,
              detail: replacementFailedDetail(`"${names[last]}"`),
            }
          : entry;
      }),
    };
  };

  return () => {
    registerNodeRoute(`${config.namespace}.readMany`, readManyRoute);
    registerNodeRoute(`${config.namespace}.forgetMany`, forgetManyRoute);
    registerNodeRoute(`${config.namespace}.remember`, rememberRoute);
    registerNodeRoute(`${config.namespace}.list`, () => ({
      content: currentIndex(),
    }));
  };
}
