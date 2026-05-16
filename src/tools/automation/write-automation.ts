// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { validateBreakpoints, type Breakpoint } from "../../automation/breakpoint-validator.ts";
import { resolveParam } from "../../automation/param-resolver.ts";

export interface WriteAutomationArgs {
  clipPath: string;
  devicePath: string;
  parameter: string | number;
  breakpoints: Breakpoint[];
  clear?: boolean;
}

export interface AutomationBridge {
  resolveDevice: (devicePath: string) => Promise<{ parameters: { name: string; min: number; max: number }[] }>;
  writeClipEnvelope: (args: { clipPath: string; paramIndex: number; breakpoints: Breakpoint[]; clear: boolean }) => Promise<void>;
  readClipEnvelope: (args: { clipPath: string; paramIndex: number }) => Promise<Breakpoint[]>;
}

/** Maximum breakpoints per write call — prevents 30s bridge timeout (Producer Pal Lesson #4). */
const BATCH = 10;

/**
 * Validate, resolve, and write clip automation breakpoints for a device parameter,
 * then read back and verify the written data.
 * @param args - Clip path, device path, parameter reference, breakpoints, and clear flag
 * @param bridge - Injected bridge providing device lookup and envelope read/write
 * @returns Result with resolved param name, count of written breakpoints, and verification flag
 */
export async function handleWriteAutomation(
  args: WriteAutomationArgs,
  bridge: AutomationBridge,
): Promise<{ param: string; written: number; verified: boolean }> {
  const param = await resolveParam(args.devicePath, args.parameter, bridge.resolveDevice);
  const bp = validateBreakpoints(args.breakpoints, { min: param.min, max: param.max });
  const clear = args.clear ?? true;

  for (let i = 0; i < bp.length; i += BATCH) {
    await bridge.writeClipEnvelope({
      clipPath: args.clipPath,
      paramIndex: param.index,
      breakpoints: bp.slice(i, i + BATCH),
      clear: clear && i === 0,
    });
  }

  const actual = await bridge.readClipEnvelope({ clipPath: args.clipPath, paramIndex: param.index });
  const verified =
    actual.length === bp.length &&
    bp.every((p, idx) => actual[idx]?.time === p.time && actual[idx].value === p.value);

  return { param: param.name, written: bp.length, verified };
}
