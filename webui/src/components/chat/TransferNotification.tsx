// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export interface TransferNotificationData {
  message: string;
  type: "success" | "error" | "warning";
}

/**
 * Dismissable notification banner for import/export feedback.
 * @param props - Component props
 * @param props.notification - Notification data
 * @param props.onDismiss - Dismiss callback
 * @returns Notification banner element
 */
export function TransferNotification({
  notification,
  onDismiss,
}: {
  notification: TransferNotificationData;
  onDismiss: () => void;
}) {
  const colorClass = notificationColorClass(notification.type);

  return (
    <div
      className={`px-3 py-1.5 text-xs flex items-center gap-2 border-b ${colorClass}`}
      role="status"
    >
      <span className="flex-1">{notification.message}</span>
      <button
        onClick={onDismiss}
        className="text-current opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Get Tailwind color classes for a notification type.
 * @param type - Notification type
 * @returns Tailwind class string
 */
function notificationColorClass(
  type: TransferNotificationData["type"],
): string {
  switch (type) {
    case "error":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    case "warning":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
    default:
      return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
  }
}
