// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What one create-clip call keeps between its targets. It is built per call and
// dies with it: never hold a LiveAPI past the request.

import { LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { laneViewOf } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { type ResolvedTakeLane } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  type LandingLog,
  newLandingLog,
} from "#src/tools/shared/clip/landings/landing-log.ts";

/** One call's shared state. */
export interface CreateRun {
  context: Partial<ToolContext>;
  /** What each arrangement write did to the clips already on its lane */
  ledger: LaneLedger;
  /** The spans the call has written to the arrangement */
  landings: LandingLog;
  /**
   * The take lanes the call has written to, by lane, made on first use. Each
   * keeps the lanes it made until the first clip written to it says so.
   */
  takeLanes: Map<string, ResolvedTakeLane>;
}

/**
 * The state for one call.
 * @param context - The request's context, carrying the call's lane view
 * @returns An empty run
 */
export function newCreateRun(context: Partial<ToolContext>): CreateRun {
  return {
    context,
    ledger: new LaneLedger({ lanes: laneViewOf(context) }),
    landings: newLandingLog(),
    takeLanes: new Map(),
  };
}
