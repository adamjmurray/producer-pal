// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { inputClass, noteClass } from "./helpers/installation-classes";

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
    <div className="flex flex-col gap-1.5">
      <label htmlFor="user-library-path" className="text-[13px] font-semibold">
        User Library folder
      </label>
      <input
        id="user-library-path"
        data-testid="user-library-path"
        type="text"
        value={value}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        aria-describedby={detected == null ? "user-library-hint" : undefined}
        className={inputClass}
      />
      {detected == null && (
        <p id="user-library-hint" className={noteClass}>
          Live shows it under Settings → Library → Location of User Library.
        </p>
      )}
    </div>
  );
}
