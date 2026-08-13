// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SkillGate } from "#webui/hooks/context/use-skill-overrides";

interface SkillGateNoteProps {
  /** The selected fragment's gate (null for the whole-document drivers). */
  gate: SkillGate | null;
}

/**
 * States the tool rule for the selected fragment. That rule was previously only
 * paraphrased inside each fragment's prose description, where it drifts and
 * can't be checked; this names the tools instead.
 *
 * Worded as what DROPS a fragment, not what includes one, because that is the
 * only direction the gate runs (see fragment-tool-gates.ts). Several fragments
 * also depend on the notation or on small-model mode — a note promising
 * inclusion would be wrong for every notation head.
 * @param props - Note props
 * @returns The note, or null for a driver (which has no gate to state)
 */
export function SkillGateNote(
  props: SkillGateNoteProps,
): preact.JSX.Element | null {
  const { gate } = props;

  if (gate == null) return null;

  if (gate === "always") {
    return <Note>Never dropped — no tool setting leaves this out.</Note>;
  }

  if (gate === "conversation-only") {
    return (
      <Note>
        Chat only — never sent to a subagent, which has no one to explain
        anything to.
      </Note>
    );
  }

  return (
    <Note>
      Dropped unless at least one of these tools is enabled:{" "}
      <span className="font-mono">{gate.join(", ")}</span>
    </Note>
  );
}

// --- Helpers below main export ---

/**
 * Shared styling for the note line.
 * @param props - Note props
 * @param props.children - Note content
 * @returns Note element
 */
function Note(props: {
  children: preact.ComponentChildren;
}): preact.JSX.Element {
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">{props.children}</p>
  );
}
