// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A param that only another action (or scope) reads makes the call ambiguous:
// either the action or the param is the mistake, and nothing says which. The
// call is refused, in one wording for every tool.

import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";

/**
 * Where a param applies: for each axis of the call (`action`, `scope`), the
 * values that read it. An axis left out means any value.
 */
export type ParamHome = Record<string, readonly string[]>;

interface Misfit {
  axis: string;
  home: readonly string[];
  param: string;
}

/**
 * Refuses a call that sends a param the call's action (or scope) doesn't read.
 * A null, blank or "null" counts as not sent. The defaulted action counts like
 * an explicit one.
 * @param call - The call's axes and their values, e.g. `{ action: "search" }`;
 *   a value of undefined means the call names none
 * @param sent - The args, under the names the caller wrote
 * @param homes - Each param that only some axis values read, and which
 * @throws Error naming the params, where they apply, and what the call has
 */
export function refuseParamsOutsideAction(
  call: Record<string, string | undefined>,
  sent: Record<string, unknown>,
  homes: Record<string, ParamHome>,
): void {
  const misfits: Misfit[] = [];

  for (const [param, home] of Object.entries(homes)) {
    if (!paramWasSent(sent[param])) {
      continue;
    }

    for (const [axis, values] of Object.entries(home)) {
      if (!values.includes(call[axis] ?? "")) {
        misfits.push({ axis, home: values, param });
      }
    }
  }

  if (misfits.length === 0) {
    return;
  }

  throw new Error(refusalMessage(call, misfits));
}

/**
 * Whether a param was sent: a null, a blank and the word "null" were not.
 * @param value - A param's value as sent
 * @returns True when it names something
 */
export function paramWasSent(value: unknown): boolean {
  return typeof value === "string" ? paramNamesSomething(value) : value != null;
}

/**
 * Words the refusal: each group of params that share a home, then what the
 * call has, then the two ways out.
 * @param call - The call's axes and their values
 * @param misfits - Each param and axis that didn't fit
 * @returns The message
 */
function refusalMessage(
  call: Record<string, string | undefined>,
  misfits: Misfit[],
): string {
  // A param that misses on two axes is one clause, so it isn't named twice.
  const homesByParam = new Map<string, string[]>();

  for (const { param, axis, home } of misfits) {
    homesByParam.set(param, [
      ...(homesByParam.get(param) ?? []),
      `${axis} ${orList(home)}`,
    ]);
  }

  const paramsByHome = new Map<string, string[]>();

  for (const [param, homes] of homesByParam) {
    const home = homes.join(" and ");

    paramsByHome.set(home, [...(paramsByHome.get(home) ?? []), param]);
  }

  const clauses = [...paramsByHome].map(
    ([home, params]) =>
      `${params.join(", ")} ${params.length === 1 ? "is" : "are"} only for ${home}`,
  );
  const axes = Object.keys(call).filter((axis) =>
    misfits.some((misfit) => misfit.axis === axis),
  );
  const has = axes
    .map((axis) =>
      call[axis] == null ? `no ${axis}` : `${axis} "${call[axis]}"`,
    )
    .join(" and ");
  const [only] = axes;
  const change =
    axes.length === 1 && only != null
      ? `${call[only] == null ? "Set" : "Change"} the ${only}`
      : "Change the call";

  return `${clauses.join("; ")}; this call has ${has}. ${change} or drop ${[...homesByParam.keys()].join(", ")}.`;
}

/**
 * @param values - The values to list
 * @returns Them quoted, as `"a"`, `"a" or "b"` or `"a", "b" or "c"`
 */
function orList(values: readonly string[]): string {
  const quoted = values.map((value) => `"${value}"`);

  if (quoted.length === 1) {
    return quoted[0] as string;
  }

  return `${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1)}`;
}
