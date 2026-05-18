// src/automation/als-tempo-automation.ts
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Eingabe-Flags, die in Slice 6 (nur lineare Tempo-Automation) gesperrt sind. */
export interface Slice6bGuardInput {
  timeSignature?: string;
  curve?: boolean;
}

/**
 * Sperrt Slice-6b-Funktionalität (Time-Signature-Marker, gekrümmte Segmente)
 * mit klarer Fehlermeldung. Kein stiller No-Op.
 * @param input - Zu prüfende Eingabe-Flags.
 * @returns void wenn rein lineare Tempo-Eingabe.
 */
export function assertNoSlice6bInput(input: Slice6bGuardInput): void {
  if (input.timeSignature != null) {
    throw new Error(
      "Time-Signature-Marker sind nicht in Slice 6 — siehe Slice 6b",
    );
  }

  if (input.curve === true) {
    throw new Error(
      "Gekrümmte Tempo-Segmente sind nicht in Slice 6 — siehe Slice 6b",
    );
  }
}
