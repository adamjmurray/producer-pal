// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef } from "preact/hooks";

/**
 * Seeds modal-local liveApiEnabled from the server value when the Settings
 * modal is closed. The /config focus-refetch in useRemoteConfig picks up
 * device Setup-tab toggle changes; this effect propagates them into the
 * modal-local state so the Tools tab reflects reality next time the modal
 * opens. Skipped while the modal is open so in-progress edits aren't trashed.
 * @param serverValue - Server-fetched liveApiEnabled value
 * @param setLocal - Setter for modal-local state
 * @param modalOpen - Whether the Settings modal is currently open
 */
export function useSyncLiveApiEnabled(
  serverValue: boolean,
  setLocal: (enabled: boolean) => void,
  modalOpen: boolean,
): void {
  const setLocalRef = useRef(setLocal);

  useEffect(() => {
    setLocalRef.current = setLocal;
  });

  useEffect(() => {
    if (!modalOpen) {
      setLocalRef.current(serverValue);
    }
  }, [serverValue, modalOpen]);
}
