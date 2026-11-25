// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The command that runs Python 3. On Windows `python3` is usually the
 * Microsoft Store stub, so use the `py` launcher there.
 *
 * @param args - Arguments for Python
 * @param platform - The OS to pick for
 * @returns The executable and its full argument list
 */
export function pythonCommand(
  args: string[],
  platform: NodeJS.Platform = process.platform,
): [string, string[]] {
  return platform === "win32" ? ["py", ["-3", ...args]] : ["python3", args];
}
