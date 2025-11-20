interface AssistantErrorProps {
  content: string;
}

/**
 * Displays error message in red box
 * @param {AssistantErrorProps} root0 - Component props
 * @param {string} root0.content - Error message content
 * @returns {JSX.Element} - React component
 */
export function AssistantError({ content }: AssistantErrorProps) {
  return (
    <div className="p-3 bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 rounded border-l-4 border-red-600 dark:border-red-400">
      <div className="font-semibold text-sm mb-1">Error</div>
      <div className="text-sm whitespace-pre-wrap">{content}</div>
    </div>
  );
}
