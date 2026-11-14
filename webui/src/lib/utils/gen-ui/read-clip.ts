// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { NOTATION_HEADER } from "#src/shared/notation";
import { getToolUrl } from "#webui/utils/mcp-url";

export interface ClipNote {
  /** MIDI pitch */
  p: number;
  /** Start, in beats */
  t: number;
  /** Duration, in beats */
  d: number;
  /** Velocity */
  v: number;
}

export interface ClipData {
  id: string;
  path?: string;
  name?: string;
  type: "midi" | "audio";
  length?: string;
  notes: ClipNote[];
}

export type ClipRead =
  | { status: "ready"; clip: ClipData }
  /** The clip is gone, or the ref names nothing (or no longer a clip). */
  | { status: "missing"; message: string }
  /** The server couldn't be asked. Says nothing about the clip. */
  | { status: "error"; message: string };

interface ToolReply {
  result?: unknown;
  isError?: boolean;
  error?: string;
}

/**
 * Read a Session clip through the tool endpoint, the way the AI would.
 * @param ref - A clip id ("12") or a path ("t0/s3")
 * @param signal - Aborts the request
 * @returns What the clip looks like now, or why it can't be shown
 */
export async function readClip(
  ref: string,
  signal?: AbortSignal,
): Promise<ClipRead> {
  let reply: ToolReply;

  try {
    const response = await fetch(
      `${getToolUrl("ppal-read-clip")}?format=json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // MIDI JSON: notes arrive as numbers, not bar|beat text to parse.
          [NOTATION_HEADER]: "midi-json",
        },
        body: JSON.stringify({
          ...(/^\d+$/.test(ref) ? { id: ref } : { path: ref }),
          include: ["notes", "timing"],
        }),
        signal,
      },
    );

    reply = (await response.json()) as ToolReply;

    if (!response.ok) {
      return {
        status: "error",
        message: reply.error ?? `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    return { status: "error", message: "Can't reach the server" };
  }

  return interpretReply(reply);
}

/**
 * @param reply - The REST tool reply
 * @returns The clip, or why there isn't one
 */
export function interpretReply(reply: ToolReply): ClipRead {
  if (reply.isError === true) {
    return { status: "missing", message: asText(reply.result, "No clip") };
  }

  const result = reply.result as Record<string, unknown> | null | undefined;

  if (result == null || typeof result !== "object" || result.id == null) {
    return { status: "missing", message: "No clip there" };
  }

  if (result.ok === false) {
    return { status: "missing", message: asText(result.detail, "No clip") };
  }

  return {
    status: "ready",
    clip: {
      id: asText(result.id, ""),
      path: typeof result.path === "string" ? result.path : undefined,
      name: typeof result.name === "string" ? result.name : undefined,
      type: result.type === "audio" ? "audio" : "midi",
      length: typeof result.length === "string" ? result.length : undefined,
      notes: parseNotes(result.notes),
    },
  };
}

/**
 * Parse the MIDI JSON note string, a JS literal with unquoted keys:
 * `[{p:60,t:0,d:1,v:100}]`. A string that doesn't parse draws no notes.
 * @param raw - The `notes` field
 * @returns The notes
 */
export function parseNotes(raw: unknown): ClipNote[] {
  if (typeof raw !== "string" || raw.trim() === "") {
    return [];
  }

  try {
    const list = JSON.parse(
      raw.replaceAll(/([{,])\s*([A-Za-z_]\w*)\s*:/g, '$1"$2":'),
    ) as Array<Partial<ClipNote>>;

    const notes: ClipNote[] = [];

    for (const n of list) {
      if (typeof n.p === "number" && typeof n.t === "number") {
        notes.push({ p: n.p, t: n.t, d: n.d ?? 1, v: n.v ?? 100 });
      }
    }

    return notes;
  } catch {
    return [];
  }
}

/**
 * @param value - Anything a reply field may hold
 * @param fallback - Used when the value isn't a string or number
 * @returns The value as text
 */
function asText(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}
