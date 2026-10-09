// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ConvertType } from "#src/tools/clip/convert/remote-script-convert-contract.ts";
import { type ClipAudioWarpQuantizeParams } from "../batch/process-single-clip-update.ts";

/** Every param one update-clip call carries, as the tool received them. */
export interface ClipUpdateArgs extends ClipAudioWarpQuantizeParams {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  notes?: string;
  transforms?: string;
  preTransforms?: string;
  name?: string;
  color?: string;
  timeSignature?: string;
  start?: string;
  length?: string;
  firstStart?: string;
  looping?: boolean;
  duplicateLoop?: boolean;
  arrangementStart?: string;
  arrangementLength?: string;
  toSlot?: string;
  toPath?: string;
  arrangementSplit?: string;
  split?: string;
  code?: string;
  envelopes?: string;
  convert?: ConvertType;
  focus?: boolean;
}
