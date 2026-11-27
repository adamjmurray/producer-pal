// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type KnobPage } from "./plugin-host-device.ts";

export interface Param {
  index: number;
  name: string;
  value?: number;
  group?: string;
  label?: string;
}

const KNOBS = 16; // knobs on a panel page

export interface AuParam {
  groups: string[];
  name: string;
}

interface Grouped {
  group: string;
  name: string;
}

/**
 * Gives each param (in vst~ order) the group its Audio Unit puts it in. The AU
 * numbers its params differently, so they're matched by name. A repeated name
 * goes to the group of its nearest uniquely named neighbour that has one: in
 * the plug-ins tried, each group is one unbroken run of params.
 *
 * @param params - The plug-in's params, in vst~ order
 * @param au - The AU's params with their groups
 * @returns The params with `group` set ("" when the AU has no match)
 */
export function groupParams(params: Param[], au: AuParam[]): Param[] {
  const byName = new Map<string, Grouped[]>();

  for (const p of groupNames(au)) {
    byName.set(p.name, [...(byName.get(p.name) ?? []), p]);
  }

  const groups = params.map((p) => {
    const matches = byName.get(p.name);

    return matches?.length === 1 ? matches[0]?.group : undefined;
  });
  const used = new Set<Grouped>();

  for (const [i, p] of params.entries()) {
    if (groups[i] != null) {
      continue;
    }

    const left = (byName.get(p.name) ?? []).filter((m) => !used.has(m));
    const match = nearestGroupMatch(groups, i, left) ?? left[0];

    if (match) {
      used.add(match);
    }

    groups[i] = match?.group ?? "";
  }

  return params.map((p, i) => ({ ...p, group: groups[i] }));
}

/**
 * Live param names must be unique in a device, and plug-ins repeat them across
 * modules (Diva's two envelopes both have "Attack"). A repeated name gets its
 * group in front ("ENV1 Attack"); anything still repeated gets " (2)", " (3)".
 * `label` keeps the plug-in's name, for a knob on its group's page.
 *
 * @param params - Params, with groups when known
 * @returns The params with unique names
 */
export function uniqueNames(params: Param[]): Param[] {
  const counts = new Map<string, number>();

  for (const { name } of params) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const seen = new Map<string, number>();

  return params.map((p) => {
    const grouped =
      (counts.get(p.name) ?? 0) > 1 && p.group
        ? `${p.group} ${p.name}`
        : p.name;
    const count = (seen.get(grouped) ?? 0) + 1;

    seen.set(grouped, count);

    return {
      ...p,
      name: count === 1 ? grouped : `${grouped} (${count})`,
      label: p.name,
    };
  });
}

/**
 * The panel's pages: one per group, split into pages of 16 knobs ("OSC 2/4").
 * Params without a group go on "Main" pages.
 *
 * @param params - Params in slot order, with groups when known
 * @returns The pages, each `count` slots from slot `first` (1-based)
 */
export function knobPages(params: Param[]): KnobPage[] {
  const runs: { group: string; first: number; count: number }[] = [];

  for (const [i, p] of params.entries()) {
    const group = p.group == null || p.group === "" ? "Main" : p.group;
    const run = runs.at(-1);

    if (run?.group === group) {
      run.count++;
    } else {
      runs.push({ group, first: i + 1, count: 1 });
    }
  }

  return runs.flatMap(({ group, first, count }) => {
    const total = Math.ceil(count / KNOBS);

    return Array.from({ length: total }, (_, k) => ({
      name: total === 1 ? group : `${group} ${k + 1}/${total}`,
      first: first + k * KNOBS,
      count: Math.min(KNOBS, count - k * KNOBS),
    }));
  });
}

// Drops the outer groups every param is in ("global" in the plug-ins tried):
// they say nothing.
function groupNames(au: AuParam[]): Grouped[] {
  const first = au[0]?.groups ?? [];
  let shared = 0;

  while (
    shared < first.length &&
    au.every((p) => p.groups[shared] === first[shared])
  ) {
    shared++;
  }

  return au.map((p) => ({
    group: p.groups.slice(shared).join(" / "),
    name: p.name,
  }));
}

function nearestGroupMatch(
  groups: (string | undefined)[],
  i: number,
  matches: Grouped[],
): Grouped | undefined {
  for (let d = 1; d < groups.length; d++) {
    const near = new Set(
      [groups[i - d], groups[i + d]].filter((g) => g != null),
    );
    const match = matches.find((m) => near.has(m.group));

    if (match) {
      return match;
    }
  }

  return undefined;
}
