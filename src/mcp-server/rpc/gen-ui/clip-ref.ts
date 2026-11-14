// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Turns the clip ref a caller gives a clip widget (an id or a path) into the
// clip's Session path, and refuses a ref that names no clip. A widget is made
// for a clip that exists: an empty slot is an error here, not a widget that
// silently picks up whatever lands there later.

import { errorMessage } from "#src/shared/error-message.ts";
import { callLiveApi } from "../../max-api-adapter.ts";
import { type WidgetFields } from "./widget-input.ts";

export type ClipRefResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

const CLIP_ID = /^\d+$/;
const SESSION_PATH = /^t\d+\/s\d+$/;

type Resolver = (ref: string) => Promise<ClipRefResult>;

let resolver: Resolver = resolveWithLive;

/**
 * Replace the lookup. For tests, which have no Live to ask.
 * @param replacement - The lookup, or null to restore the real one
 */
export function setClipResolverForTesting(replacement: Resolver | null): void {
  resolver = replacement ?? resolveWithLive;
}

/**
 * Check and rewrite a caller's widget fields: a `ref` that names a clip becomes
 * that clip's path. Anything else passes through for the store to judge.
 * @param fields - The caller's fields
 * @returns The fields to store, or why the clip can't be shown
 */
export async function prepareWidgetFields(
  fields: WidgetFields,
): Promise<{ ok: true; fields: WidgetFields } | { ok: false; error: string }> {
  const ref = typeof fields.ref === "string" ? fields.ref.trim() : "";

  if (!CLIP_ID.test(ref) && !SESSION_PATH.test(ref)) {
    return { ok: true, fields };
  }

  const found = await resolver(ref);

  return found.ok
    ? { ok: true, fields: { ...fields, ref: found.path } }
    : found;
}

/**
 * Ask Live for the clip, the way the AI would.
 * @param ref - A clip id or Session path
 * @returns The clip's Session path, or why there isn't one
 */
async function resolveWithLive(ref: string): Promise<ClipRefResult> {
  try {
    const response = (await callLiveApi(
      "ppal-read-clip",
      CLIP_ID.test(ref) ? { id: ref, include: [] } : { path: ref, include: [] },
      { compactOutput: false },
    )) as { content: Array<{ text: string }>; isError?: boolean };
    const text = response.content[0]?.text ?? "";

    if (response.isError === true) {
      return { ok: false, error: `No clip at ${ref}: ${text}` };
    }

    const path = (JSON.parse(text) as { path?: unknown } | null)?.path;

    return typeof path === "string" && SESSION_PATH.test(path)
      ? { ok: true, path }
      : { ok: false, error: `${ref} is not a Session clip` };
  } catch (error) {
    return {
      ok: false,
      error: `Couldn't check ${ref} in Live: ${errorMessage(error)}`,
    };
  }
}
