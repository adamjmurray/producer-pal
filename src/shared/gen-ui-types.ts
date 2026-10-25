// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Generative UI: the widget vocabulary and the event stream shared by the
// server and the chat UI. Import-free, like config.ts, so the web UI can use it.

/** The tool the AI uses to change widgets. */
export const GEN_UI_TOOL_ID = "ppal-ui";

export const WIDGET_KINDS = ["clip", "text"] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number];

interface WidgetBase {
  id: string;
  title?: string;
}

/** Shows one Session clip. `ref` is a clip id ("12") or a path ("t0/s3"). */
export interface ClipWidget extends WidgetBase {
  kind: "clip";
  ref: string;
}

/** A plain note from the AI. */
export interface TextWidget extends WidgetBase {
  kind: "text";
  text: string;
}

export type Widget = ClipWidget | TextWidget;

/** What a "Live objects changed" event names. */
export interface LiveChange {
  tool: string;
  /** Live object ids the tool call named or created. */
  ids: string[];
  /** Object paths (`t0/s3`) the tool call named or created. */
  paths: string[];
  /** The call may have changed anything (timeout, or it named nothing). */
  all: boolean;
}

/**
 * How clip widgets stay current. "listening": the remote script watches the
 * clips in Live, so hand edits show up. "writes-only": they refresh after AI
 * tool calls only.
 */
export interface SyncStatus {
  mode: "listening" | "writes-only";
  detail: string;
}

export type WidgetChange =
  | { op: "upsert"; widget: Widget }
  | { op: "remove"; id: string };

/**
 * One server-sent event. `version` rises by one per event, so a client that
 * sees a jump knows it missed something and reloads the snapshot.
 */
export type GenUiEvent =
  | {
      type: "snapshot";
      epoch: string;
      version: number;
      widgets: Widget[];
      sync: SyncStatus;
    }
  | { type: "status"; version: number; sync: SyncStatus }
  | { type: "widget"; version: number; change: WidgetChange }
  | ({ type: "live"; version: number } & LiveChange);

export const GEN_UI_WIDGETS_PATH = "/api/ui/widgets";

export const GEN_UI_EVENTS_PATH = "/api/ui/events";
