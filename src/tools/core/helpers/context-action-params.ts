// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ParamHome,
  refuseParamsOutsideAction,
} from "#src/tools/shared/schema/refuse-params-outside-action.ts";

const CONTEXT_PARAM_HOMES: Record<string, ParamHome> = {
  name: { scope: ["memory"] },
  description: { scope: ["memory"], action: ["write"] },
  content: { action: ["write"] },
};

/**
 * Refuses a context call that doesn't fit: a delete outside the memory scope
 * (the project and global documents are replaced, never deleted), or a param
 * the action or scope doesn't read.
 * @param call - The call's action and scope
 * @param call.action - The action
 * @param call.scope - The scope
 * @param args - The args as sent
 */
export function refuseContextParamsOutsideAction(
  { action, scope }: { action?: string; scope: string },
  args: object,
): void {
  if (action === "delete" && scope !== "memory") {
    throw new Error(
      `action "delete" is only for scope "memory", where it removes one entry by name. ` +
        `scope "${scope}" holds one document: use action "write" to replace it.`,
    );
  }

  refuseParamsOutsideAction(
    { action: action ?? "", scope },
    { ...args },
    CONTEXT_PARAM_HOMES,
  );
}
