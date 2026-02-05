// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

export class Task {
  private callback: () => void;

  /**
   * Create a scheduled task
   * @param callback - Callback function
   * @param context - Execution context
   */
  constructor(callback: () => void, context?: unknown) {
    this.callback = callback.bind(context);
  }

  /**
   * Schedule the task (immediately invokes in tests)
   * @param _ms - Delay in milliseconds (ignored in tests)
   */
  schedule(_ms: number): void {
    this.callback(); // immediately invoke during tests
  }
}
