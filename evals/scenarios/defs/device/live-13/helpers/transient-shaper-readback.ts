// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { argText } from "../../../arg-text.ts";
import {
  getToolCalls,
  parsedToolResult,
} from "../../../../assertions/index.ts";
import { type EvalTurnResult } from "../../../../types.ts";
import {
  paramProblem,
  paramText,
} from "../../helpers/device-param-readback.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/**
 * The args that read back the Transient Shaper the model added to the Racks
 * track, by the id its create-device call returned. The model may put it
 * anywhere on the track, so no device index is assumed.
 *
 * @param turns - All conversation turns
 * @returns read-device args for the last Transient Shaper created
 * @throws When none was created, or it landed off the Racks track
 */
export function transientShaperArgs(
  turns: EvalTurnResult[],
): Record<string, unknown> {
  const call = getToolCalls(turns).findLast(
    (candidate) =>
      candidate.name === TOOLS.createDevice &&
      /transient\s*shaper/i.test(
        // `device` is an alias models reach for unprompted.
        argText(candidate.args.deviceName ?? candidate.args.device),
      ),
  );
  const parsed = call == null ? null : parsedToolResult(call);
  const created = (Array.isArray(parsed) ? parsed[0] : parsed) as {
    id?: unknown;
    path?: unknown;
  } | null;

  if (created?.id == null) {
    throw new Error("no successful create-device of a Transient Shaper");
  }

  if (!argText(created.path).startsWith("t1/")) {
    throw new Error(
      `the Transient Shaper landed at ${argText(created.path)}, not on the Racks track`,
    );
  }

  return { id: argText(created.id), include: ["params", "param-values"] };
}

/**
 * What is wrong with the Transient Shaper's values: Attack 40 and Dry/Wet 50.
 * The sidechain gain only has to read +6 when the sidechain is on; with it off,
 * the gain does nothing and what the model told the user is judged instead.
 *
 * @param result - Parsed ppal-read-device result, read with param values
 * @returns A description of what is wrong, or null when it is as asked
 */
export function transientShaperProblem(result: unknown): string | null {
  const problems = [
    paramProblem(result, "Attack", 40),
    paramProblem(result, "Dry/Wet", 50),
  ];
  const sidechain = paramText(result, "S/C On");

  if (sidechain == null) {
    problems.push("no S/C On param");
  } else if (/^on$/i.test(sidechain)) {
    problems.push(paramProblem(result, "S/C Gain", 6));
  }

  const found = problems.filter((problem) => problem != null);

  return found.length === 0 ? null : found.join("; ");
}
