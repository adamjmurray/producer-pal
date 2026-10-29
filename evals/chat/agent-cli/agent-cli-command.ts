// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Turn an agent CLI executable into something `spawn` can run without a shell.
 *
 * Windows can't execute a shebang script, and an npm-installed CLI there is a
 * `.cmd` shim, which needs a shell. Both run as `node <entry.js>` instead. Not
 * through cmd.exe: killing cmd.exe on a timeout would leave the CLI running.
 *
 * @param executable - Command name or path
 * @param args - CLI arguments
 * @param platform - OS to resolve for
 * @param searchPath - PATH to look for a `.cmd` shim in
 * @returns The command and arguments to spawn
 */
export function agentCliCommand(
  executable: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  searchPath: string = process.env.PATH ?? "",
): [string, string[]] {
  let script: string | null = null;

  if (/\.[cm]?js$/i.test(executable)) {
    script = executable;
  } else if (platform === "win32") {
    script = npmShimEntry(findShim(executable, searchPath));
  }

  return script == null
    ? [executable, args]
    : [process.execPath, [script, ...args]];
}

/**
 * @param executable - Command name or path
 * @param searchPath - `;`-separated folders to search
 * @returns The `.cmd` file it names, if there is one
 */
function findShim(executable: string, searchPath: string): string | null {
  if (/\.cmd$/i.test(executable)) {
    return executable;
  }

  // A path or a name with an extension (claude.exe) runs as is
  if (path.extname(executable) !== "" || /[/\\]/.test(executable)) {
    return null;
  }

  for (const dir of searchPath.split(";").filter(Boolean)) {
    const candidate = path.join(dir, `${executable}.cmd`);

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * @param shim - An npm `.cmd` shim
 * @returns The JS file it runs, or null when it isn't an npm shim
 */
function npmShimEntry(shim: string | null): string | null {
  if (shim == null) {
    return null;
  }

  // npm's shims end: "%_prog%"  "%dp0%\node_modules\pkg\cli.js" %*
  const match = /"%dp0%\\([^"]+\.[cm]?js)"\s+%\*/i.exec(
    readFileSync(shim, "utf8"),
  );

  // Split on \ so the path also joins on macOS and Linux, where tests run it
  return match?.[1] == null
    ? null
    : path.join(path.dirname(shim), ...match[1].split("\\"));
}
