// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type ArrangementTrack,
  type ResolvedTakeLane,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { type SongMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type Cover,
  type Target,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type ClipDestinations } from "../clip/clip-destinations.ts";
import { type SlotCopySource } from "../clip/duplicate-clip-slot.ts";
import { type ScenePass } from "../sources/scene-clips.ts";
import { type LaneTarget } from "../sources/copy-clip-to-lane.ts";
import { type SourceShare } from "../sources/source-plan.ts";

/** The args of one duplicate call, as the tool receives them. */
export interface DuplicateArgs {
  type: string;
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  count?: number;

  arrangementStart?: string;
  /** Deprecated: locator ref(s), folded onto arrangementStart as `loc:` */
  locator?: string;
  arrangementLength?: string;
  name?: string;
  color?: string;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
  focus?: boolean;
  toSlot?: string;
  toPath?: string;
  transforms?: string;
  code?: string;
  takeLane?: number | string;
  takeLaneName?: string;
}

/** The call as it is read once: what it copies, and where the copies go. */
export interface DuplicateCall {
  args: DuplicateArgs;
  type: string;
  id?: string;
  path?: string;
  count: number;
  /** Whether the call copies clips lane to lane instead of making a track */
  laneCopy: boolean;
  /** Whether a destination names a take lane */
  toTakeLane: boolean;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  /** The destination as settled: a scene's coordinate and locators folded in */
  toPath?: string;
  arrangementStart?: string;
  /** Whether the copies land on the song timeline */
  onArrangement: boolean;
  /** The param the caller wrote the positions in */
  startParam: string;
}

/** What each copy is told about itself, paired by its place in the call. */
export interface CopyLabel {
  name?: string;
  color?: string;
  /** The arrangement length asked for this copy */
  length?: string;
}

/** What one copy is, and what its write needs to make it. */
export type CopyBody =
  | { kind: "track"; sourceId: string }
  | { kind: "scene"; sourceId: string }
  | { kind: "scene-arrangement"; sourceId: string; startBeats: number }
  | { kind: "slot"; sourceId: string; slot: ClipSlotPosition }
  | ArrangementCopy
  | { kind: "lane"; entry: string; target: LaneTarget }
  | { kind: "device" | "chain" | "pad"; sourceId: string; toPath?: string };

/** One clip copy onto the arrangement, on the main lane or a take lane. */
export interface ArrangementCopy {
  kind: "arrangement";
  sourceId: string;
  target: ArrangementTrack;
  startBeats: number;
}

/** What one target of a duplicate call carries into its write. */
export interface CopyPayload {
  body: CopyBody;
  label: CopyLabel;
}

/** What a copy is once its label is known. */
export interface CopyMade {
  body: CopyBody;
  /**
   * What the copy writes over, read when asked: a source that can't be read
   * says nothing here, and its copy goes on to fail on its own.
   */
  covers?: () => Cover[] | undefined;
  /** How an entry addresses it, when that depends on the label */
  named?: NamedTarget;
}

/** A copy named but not yet paired with its label: it can be made, or not. */
export type CopyDraft =
  | {
      /** How a skip entry addresses it */
      named: NamedTarget;
      /** Why it can't be made */
      skip: string;
      make?: undefined;
    }
  | {
      named: NamedTarget;
      skip?: undefined;
      /** What the copy is, and what it writes over, once its label is known */
      make: (label: CopyLabel) => CopyMade;
    };

/** What the call keeps between its targets. Built per call, gone with it. */
export interface DuplicateRun {
  context: Partial<ToolContext>;
  /** The call's arrangement lanes, so each copy can say what it overwrote */
  ledger: LaneLedger;
  /** Take lanes the call has resolved, by their path */
  lanes: Map<string, ResolvedTakeLane>;
  /** The destination tracks the call has looked up, by index */
  tracks: Map<number, LiveAPI>;
  /** The source objects the call has looked up, by id */
  objects: Map<string, LiveAPI>;
  /** What each source clip's slot copies share, by the clip's id */
  slotSources: Map<string, SlotCopySource>;
  /** Deprecated: the name for a take lane a copy makes */
  takeLaneName: string | undefined;
  /** Whether any destination the call named is a take lane */
  namesTakeLane: boolean;
  /** The last copy of each source scene that landed, by the source's id */
  lastScene: Map<string, string>;
  /** Each source scene as read, by its id: its clips and length */
  scenes: Map<string, ScenePass>;
  /** The song meter, read when the call first needs it */
  meter: SongMeter | null;
  sources: SourceShare[];
  /** One destination set per source, for a clip call */
  clipDestinations: ClipDestinations[] | null;
  /** Where the copies go: "arrangement", "session", or nothing for a device */
  destination?: string;
  /** What to re-run for after the deadline: "copy" or "destination" */
  rerun: string;
}

/** The targets a duplicate call writes, in the order named. */
export type DuplicateTarget = Target<CopyPayload>;
