// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";

/** The in-progress "New preset" form: whether it's open, and its two fields. */
export interface UsePresetDraftReturn {
  open: boolean;
  name: string;
  description: string;
  setName: (value: string) => void;
  setDescription: (value: string) => void;
  /** Open the form on empty fields. */
  start: () => void;
  /** Close the form and drop the fields. */
  close: () => void;
}

/**
 * State for the Presets tab's create form, kept out of PresetControls so that
 * component stays readable.
 *
 * Reports `open` to the caller on every change *and on unmount*, so the
 * settings footer can disable its Save while the form owns the dialog.
 * Unmounting matters: switching tabs drops the draft, and a stale "open" would
 * leave Save disabled with no form on screen to finish or cancel.
 * @param onOpenChange - Notified whenever the form opens or closes
 * @returns The draft fields plus start/close
 */
export function usePresetDraft(
  onOpenChange?: (open: boolean) => void,
): UsePresetDraftReturn {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Through a ref so the effect keys on `open` alone: an inline arrow callback
  // would otherwise re-fire it every render, and reporting false→true each time
  // would spin the parent's state.
  const notify = useRef(onOpenChange);

  // Written in render so the effect below sees the current callback on the same
  // pass that `open` flips. Its own effect would work only if declared first,
  // making correctness depend on effect order.
  // eslint-disable-next-line react/immutability -- latest-callback ref, see above
  notify.current = onOpenChange;

  useEffect(() => {
    notify.current?.(open);

    return () => notify.current?.(false);
  }, [open]);

  const start = useCallback(() => {
    setName("");
    setDescription("");
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setName("");
    setDescription("");
    setOpen(false);
  }, []);

  return { open, name, description, setName, setDescription, start, close };
}
