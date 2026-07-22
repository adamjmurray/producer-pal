// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  getCustomSkillEntryUrl,
  getCustomSkillsCollectionUrl,
} from "#webui/utils/mcp-url";
import {
  type DocCollectionStatus,
  type UseDocCollectionReturn,
  useDocCollection,
} from "./use-doc-collection";

/** One stored custom skill, as the manager needs it. */
export interface CustomSkillView {
  /** Slug (filename without extension); the stable handle for save/delete. */
  name: string;
  /** One-line "load me when…" hook shown in the list. */
  description: string;
  /** Whether the skill is injected/loadable (the enable toggle). */
  enabled: boolean;
  /** The instruction body (markdown). */
  body: string;
}

/** The fields a save writes (the slug comes from the entry name / URL). */
export interface CustomSkillInput {
  description: string;
  content: string;
  enabled: boolean;
}

/** Status of the whole custom-skills collection. */
export type CustomSkillsStatus = DocCollectionStatus<CustomSkillView>;

export type UseCustomSkillsCollectionReturn = UseDocCollectionReturn<
  CustomSkillView,
  CustomSkillInput
>;

/**
 * Read/write the user-authored custom-skills collection
 * (~/.producer-pal/skills-custom/) — a thin binding of the generic
 * {@link useDocCollection} to the custom-skills endpoints. Unlike memory these
 * entries carry an `enabled` flag the editor toggles; otherwise the list/save/
 * delete + external-write polling is identical.
 *
 * @returns Collection state plus save/delete and refresh actions
 */
export function useCustomSkillsCollection(): UseCustomSkillsCollectionReturn {
  return useDocCollection<CustomSkillView, CustomSkillInput>({
    label: "Custom skill",
    collectionUrl: getCustomSkillsCollectionUrl,
    entryUrl: getCustomSkillEntryUrl,
  });
}
