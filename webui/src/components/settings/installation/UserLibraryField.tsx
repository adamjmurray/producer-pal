// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { inputClass, noteClass } from "./installation-classes";

interface UserLibraryFieldProps {
  /** The User Library the server detected, or null. */
  detected: string | null;
  /** What the field shows. */
  value: string;
  onInput: (value: string) => void;
}

/**
 * The User Library path both installs use. Always editable: the server's guess
 * can be wrong, and it has none at all when Live has never written its
 * preferences.
 * @param {UserLibraryFieldProps} props - Component props
 * @param {string | null} props.detected - The detected User Library, or null
 * @param {string} props.value - What the field shows
 * @param {(value: string) => void} props.onInput - Called as the user types
 * @returns {JSX.Element} The path field
 */
export function UserLibraryField({
  detected,
  value,
  onInput,
}: UserLibraryFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor="user-library-path" className="block">
        {detected == null
          ? "Where is your User Library?"
          : "Is this your User Library?"}
      </label>
      <input
        id="user-library-path"
        data-testid="user-library-path"
        type="text"
        value={value}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        className={inputClass}
      />
      {detected == null && (
        <p className={noteClass}>
          Live shows it under Settings → Library → Location of User Library.
        </p>
      )}
    </div>
  );
}
