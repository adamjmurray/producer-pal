#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * List the Python Live API members that Max's LiveAPI can't reach, by diffing
 * the Python surface against the allowlist Max's LiveAPI enforces. Also saves
 * the full Python surface, to diff against the next Live version.
 *
 * Usage: node scripts/live-api/python-probe/compare-python-max.ts [out-dir]
 *
 * Needs the /probe route (`npm run remote-script:install -- --probe`, then
 * restart Live). Any Live Set works. See
 * dev/live-api/python-remote-script-api/README.md.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSnippet, runProbe } from "./probe-client.ts";

interface Surface {
  version: string;
  classes: Record<string, string[]>;
  enums: Record<string, string[]>;
  functions: string[];
}

const outDir = process.argv[2] ?? "tmp";
const surface = (await runProbe(readSnippet("python-surface.py"))) as Surface;
const allowlist = (await runProbe(readSnippet("max-allowlist.py"))) as Record<
  string,
  string[]
>;
const lines = [`# Python members Max can't reach (Live ${surface.version})`];
const noAccess: string[] = [];

for (const [cls, allMembers] of Object.entries(surface.classes)) {
  const members = allMembers.filter(isComparable);
  const allowed = allowlist[cls];

  if (members.length === 0) {
    continue;
  }

  if (allowed == null) {
    noAccess.push(cls);
    continue;
  }

  const pythonOnly = members.filter((member) => !allowed.includes(member));

  if (pythonOnly.length > 0) {
    lines.push("", `## ${cls}`, pythonOnly.join(", "));
  }
}

lines.push(
  "",
  "## Classes Max can't reach at all",
  noAccess.join(", "),
  "",
  "## Module functions (Max can't call any)",
  surface.functions.join(", "),
);

mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, `python-vs-max-${surface.version}.txt`);
const surfacePath = join(outDir, `python-surface-${surface.version}.json`);

writeFileSync(reportPath, `${lines.join("\n")}\n`);
writeFileSync(surfacePath, `${JSON.stringify(surface, null, 2)}\n`);
console.log(`Wrote ${reportPath} and ${surfacePath}`);

/**
 * Whether the member is worth comparing. Listeners and nested classes have no
 * Max counterpart to look for.
 *
 * @param name - A Python member name
 * @returns True to check it
 */
function isComparable(name: string): boolean {
  return (
    !/^(add|remove)_\w+_listener$|_has_listener$/.test(name) &&
    !name.startsWith("_") &&
    !/^[A-Z]/.test(name)
  );
}
