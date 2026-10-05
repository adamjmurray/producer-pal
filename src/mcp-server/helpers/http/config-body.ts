// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { isNotation, NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { validateTools } from "../../create-mcp-server.ts";

// `null` is allowed on the two text fields: Max sends a bare null for an
// emptied one. Booleans are strict: the string "false" is refused, not read as
// true. Unknown keys are ignored — on a release build that includes
// `remoteScriptEnabled`, which only a debug build accepts.
const debugConfigBodySchema = z.object({
  projectContext: z.string().nullable().optional(),
  sampleFolder: z.string().nullable().optional(),
  smallModelMode: z.boolean().optional(),
  jsonOutput: z.boolean().optional(),
  liveApiEnabled: z.boolean().optional(),
  remoteScriptEnabled: z.boolean().optional(),
  notation: z
    .custom<Notation>(isNotation, {
      message: `must be one of: ${NOTATIONS.join(", ")}`,
    })
    .optional(),
  tools: z.unknown().optional(),
});

const releaseConfigBodySchema = debugConfigBodySchema.omit({
  remoteScriptEnabled: true,
});

export type ConfigBody = Omit<
  z.infer<typeof debugConfigBodySchema>,
  "tools"
> & {
  tools?: string[];
};

export interface ConfigBodyError {
  error: string;
  fields: Record<string, string>;
  validToolNames?: string[];
}

/**
 * Check every field of a POST /config body, so the caller can refuse the whole
 * request before changing anything.
 *
 * @param body - The parsed request body
 * @param currentLiveApiEnabled - liveApiEnabled to use when the body omits it
 * @param debugBuild - Whether this is a debug build, the only kind that accepts
 *   `remoteScriptEnabled`
 * @returns The validated body, or an error naming every bad field
 */
export function parseConfigBody(
  body: unknown,
  currentLiveApiEnabled: boolean,
  debugBuild: boolean,
): { ok: true; value: ConfigBody } | { ok: false; error: ConfigBodyError } {
  const parsed = (
    debugBuild ? debugConfigBodySchema : releaseConfigBodySchema
  ).safeParse(body);
  const fields: Record<string, string> = {};
  let validToolNames: string[] | undefined;

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "body");

      fields[key] ??=
        issue.code === "invalid_type"
          ? `must be a ${FIELD_TYPES[key] ?? "value"}`
          : issue.message;
    }
  }

  // Checked even when other fields failed, so one 400 names every bad field.
  const raw = (body ?? {}) as Record<string, unknown>;

  if (raw.tools !== undefined) {
    const liveApiEnabled =
      typeof raw.liveApiEnabled === "boolean"
        ? raw.liveApiEnabled
        : currentLiveApiEnabled;
    const toolsError = validateTools(raw.tools, liveApiEnabled);

    if (toolsError) {
      fields.tools = toolsError.error;
      validToolNames = toolsError.validToolNames;
    }
  }

  if (!parsed.success || Object.keys(fields).length > 0) {
    return {
      ok: false,
      error: {
        error: Object.entries(fields)
          .map(([key, message]) => `${key}: ${message}`)
          .join("; "),
        fields,
        ...(validToolNames && { validToolNames }),
      },
    };
  }

  // validateTools above refused anything but an array of strings.
  return { ok: true, value: parsed.data as ConfigBody };
}

const FIELD_TYPES: Record<string, string> = {
  projectContext: "string",
  sampleFolder: "string",
  notation: "string",
  smallModelMode: "boolean",
  jsonOutput: "boolean",
  liveApiEnabled: "boolean",
  remoteScriptEnabled: "boolean",
};
