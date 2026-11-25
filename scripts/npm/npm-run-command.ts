// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @param args - Arguments for `npm run`, starting with the script name
 * @returns The command and arguments to spawn
 */
export function npmRunCommand(args: string[]): [string, string[]] {
  // Run npm's own JS entry through node: Windows can't spawn npm.cmd without a shell
  const npmCli = process.env.npm_execpath;

  return npmCli == null
    ? ["npm", ["run", ...args]]
    : [process.execPath, [npmCli, "run", ...args]];
}
