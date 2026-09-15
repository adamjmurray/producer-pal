// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { confirmEntryDelete } from "#webui/components/context/collection/collection-delete-confirm";
import {
  BodyField,
  CollectionEditorShell,
  DescriptionField,
  EditorFooter,
  NameField,
} from "#webui/components/context/collection/collection-editor-parts";
import { useDraftLeaveGuard } from "#webui/components/context/collection/leave-guard";
import {
  type CustomSkillView,
  type UseCustomSkillsCollectionReturn,
} from "#webui/hooks/context/use-custom-skills-collection";
import { useCollectionEntryAutosave } from "#webui/hooks/context/helpers/use-doc-collection";
import { useCollectionEntryDraft } from "#webui/hooks/context/helpers/use-collection-entry-draft";

interface CustomSkillEditorProps {
  /** The collection hook (per-entry save/delete lives here). */
  collection: UseCustomSkillsCollectionReturn;
  /** The skill being edited, or null when creating a new one. */
  entry: CustomSkillView | null;
  /** Called after a successful save with the stored skill's slug. */
  onSaved: (name: string) => void;
  /** Called after a successful delete. */
  onDeleted: () => void;
}

/**
 * Right-pane form for one custom skill: name (editable only when creating — the
 * slug is the stable handle), a one-line description hook, an enabled toggle, and
 * the instruction body the assistant loads on demand. Keyed by the selected
 * entry in the parent so the draft re-seeds on selection change. An existing
 * skill autosaves so a draft is never lost on close/switch: idle-debounced and
 * flushed on unmount. A new skill is created ONLY by the explicit Create button
 * — leaving a half-typed one confirms the discard first. Surfaces a Reload
 * banner when this skill changed elsewhere (a hand edit, another tab) while the
 * draft here is clean.
 * @param props - Editor props
 * @returns Editor element
 */
export function CustomSkillEditor(
  props: CustomSkillEditorProps,
): preact.JSX.Element {
  const { collection, entry, onSaved, onDeleted } = props;
  const draft = useCollectionEntryDraft(entry);
  const { isNew, name, description, body, targetName } = draft;
  const [enabled, setEnabled] = useState(entry?.enabled ?? true);
  // Two flavors on purpose: the autosave hook must NOT be gated on an in-flight
  // save (it chains overlapping writes, and gating drops its unmount flush
  // mid-save), while the footer button still disables while one is on the wire.
  const draftValid = targetName.trim().length > 0 && body.trim().length > 0;
  const canSave = draftValid && collection.saveStatus !== "saving";

  const doSave = (): Promise<CustomSkillView | null> =>
    collection.saveEntry(
      targetName,
      { description, content: body, enabled },
      isNew,
    );

  const { noteSaved, externalUpdate, adoptExternal } =
    useCollectionEntryAutosave({
      canSave: draftValid,
      draftKey: customSkillKey({
        name: targetName,
        description,
        enabled,
        body,
      }),
      autosaveOnIdle: !isNew,
      // A new skill is created only by the explicit Create button — never
      // silently flushed on navigate-away. The discard confirm below guards it.
      flushOnLeave: !isNew,
      persist: async () => {
        const saved = await doSave();

        return saved ? customSkillKey(saved) : null;
      },
      externalKey: entry != null ? customSkillKey(entry) : undefined,
    });

  // A new draft with anything typed in it guards against silent loss: leaving it
  // (New, select another skill, switch tabs, close the browser tab) confirms a
  // discard first. A blank draft (or an existing skill) guards nothing.
  useDraftLeaveGuard(draft.isDirtyNew, DISCARD_NEW_SKILL_MESSAGE);

  const handleSave = async (): Promise<void> => {
    const saved = await doSave();

    if (saved) {
      noteSaved(customSkillKey(saved));
      onSaved(saved.name);
    }
  };

  // Adopt the server's fields as the draft AND advance the autosave baseline.
  // adoptExternal after the reseed is safe (it reads externalKey off a ref the
  // reseed doesn't touch), unlike noteSaved — see MemoryEntryEditor.
  const handleReload = (): void => {
    if (entry == null) {
      return;
    }

    draft.reseed(entry);
    setEnabled(entry.enabled);
    adoptExternal();
  };

  return (
    <CollectionEditorShell
      externalUpdate={externalUpdate}
      externalMessage="This skill was changed elsewhere (another tab or a hand edit)."
      onReload={handleReload}
    >
      <NameField
        isNew={isNew}
        name={name}
        displayName={entry?.name}
        placeholder="jazz-voicings"
        onChange={draft.setName}
      />
      <DescriptionField
        hint="One-line “load me when…” hook shown in the index."
        value={description}
        onChange={draft.setDescription}
      />
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
        />
        Enabled
        <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
          Only enabled skills are offered to the assistant.
        </span>
      </label>
      <BodyField
        label="Instructions"
        value={body}
        onChange={draft.setBody}
        editorKey={draft.bodyEditorKey}
        heightClass="h-80"
      />
      <EditorFooter
        saveStatus={collection.saveStatus}
        saveError={collection.saveError}
        isNew={isNew}
        canSave={canSave}
        createLabel="Create skill"
        onSave={() => void handleSave()}
        onDelete={() => void confirmDelete(collection, entry, onDeleted)}
      />
    </CollectionEditorShell>
  );
}

// --- Helpers below main export ---

/**
 * Confirm, then delete this skill and notify the parent. A new draft has
 * nothing to delete.
 * @param collection - The collection hook (owns deleteEntry)
 * @param entry - The skill being edited, or null when creating a new one
 * @param onDeleted - Called after a successful delete
 */
async function confirmDelete(
  collection: UseCustomSkillsCollectionReturn,
  entry: CustomSkillView | null,
  onDeleted: () => void,
): Promise<void> {
  if (entry == null) {
    return;
  }

  if (!confirmEntryDelete("custom skill", entry.name)) {
    return;
  }

  if (await collection.deleteEntry(entry.name)) {
    onDeleted();
  }
}

/** Confirm text shown before abandoning an unsaved new-skill draft. */
const DISCARD_NEW_SKILL_MESSAGE =
  "Discard this new skill? Your changes will be lost.";

/**
 * Serialize a custom skill's persisted fields into one comparable key, used as
 * both the autosave `draftKey` (the local form fields) and `externalKey` (the
 * live `entry` prop) — the identical shape is what makes them comparable for
 * external-update detection.
 * @param fields - The skill's persisted fields
 * @param fields.name - The skill's slug
 * @param fields.description - The one-line "load me when…" hook
 * @param fields.enabled - Whether the skill is offered to the assistant
 * @param fields.body - The instruction body
 * @returns A stable, order-sensitive serialization of the four fields
 */
function customSkillKey(fields: {
  name: string;
  description: string;
  enabled: boolean;
  body: string;
}): string {
  return JSON.stringify([
    fields.name,
    fields.description,
    fields.enabled,
    fields.body,
  ]);
}
