export function RetryButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
      title="Retry from your last message"
    >
      ↻
    </button>
  );
}
