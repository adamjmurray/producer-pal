// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import { resolvePanelNotification } from "#webui/hooks/chat/helpers/conversations/panel-notification";

describe("resolvePanelNotification", () => {
  const dismissUndo = vi.fn();
  const dismissLimit = vi.fn();

  /**
   * Build an undo-state stub with the given banner.
   * @param banner - The undo banner, or null when none is pending
   * @returns Undo notification state
   */
  function undoState(banner: TransferNotificationData | null) {
    return { undoNotification: banner, dismissUndoNotification: dismissUndo };
  }

  /**
   * Build a limit-state stub with the given banner.
   * @param banner - The limit/save-error banner, or null when none
   * @returns Limit notification state
   */
  function limitState(banner: TransferNotificationData | null) {
    return {
      limitNotification: banner,
      dismissLimitNotification: dismissLimit,
    };
  }

  const warn: TransferNotificationData = {
    message: "Deleted “x”",
    type: "warning",
  };
  const undoErr: TransferNotificationData = { message: "Retry", type: "error" };
  const limitWarn: TransferNotificationData = {
    message: "limit",
    type: "warning",
  };
  const saveErr: TransferNotificationData = {
    message: "storage full",
    type: "error",
  };

  it("shows the undo banner over a passive limit warning", () => {
    const r = resolvePanelNotification(undoState(warn), limitState(limitWarn));

    expect(r.notification).toBe(warn);
    expect(r.dismissNotification).toBe(dismissUndo);
  });

  it("surfaces a save-error over a stale undo warning banner", () => {
    // The undo banner never auto-expires; a later save error must not hide
    // behind it indefinitely.
    const r = resolvePanelNotification(undoState(warn), limitState(saveErr));

    expect(r.notification).toBe(saveErr);
    expect(r.dismissNotification).toBe(dismissLimit);
  });

  it("keeps the fresher undo banner when both are errors", () => {
    const r = resolvePanelNotification(undoState(undoErr), limitState(saveErr));

    expect(r.notification).toBe(undoErr);
    expect(r.dismissNotification).toBe(dismissUndo);
  });

  it("shows an undo error over a limit warning", () => {
    const r = resolvePanelNotification(
      undoState(undoErr),
      limitState(limitWarn),
    );

    expect(r.notification).toBe(undoErr);
    expect(r.dismissNotification).toBe(dismissUndo);
  });

  it("falls back to the limit banner when no undo is pending", () => {
    const r = resolvePanelNotification(undoState(null), limitState(saveErr));

    expect(r.notification).toBe(saveErr);
    expect(r.dismissNotification).toBe(dismissLimit);
  });

  it("returns null with the limit dismiss handler when neither banner is present", () => {
    const r = resolvePanelNotification(undoState(null), limitState(null));

    expect(r.notification).toBeNull();
    expect(r.dismissNotification).toBe(dismissLimit);
  });
});
