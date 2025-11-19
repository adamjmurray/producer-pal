import { toolNames } from "../../../config.js";
import { truncateString } from "../../../utils/truncate-string.js";

interface AssistantToolCallProps {
  name: string;
  args: Record<string, unknown>;
  result: string | null;
  isError?: boolean;
}

/**
 *
 * @param root0
 * @param root0.name
 * @param root0.args
 * @param root0.result
 * @param root0.isError
 */
export function AssistantToolCall({
  name,
  args,
  result,
  isError,
}: AssistantToolCallProps) {
  return (
    <details
      className={`text-xs p-2 font-mono bg-gray-200 dark:bg-gray-900 rounded ${
        result ? "" : "animate-pulse"
      } ${isError ? "border-l-3 border-red-500" : ""}`}
    >
      <summary>
        &nbsp;🔧{" "}
        {!result ? "using tool: " : isError ? "tool failed: " : "used tool: "}
        {toolNames[name] ?? name}
      </summary>
      <div className="mt-1 p-1 break-all text-gray-500 dark:text-gray-500">
        {name}({JSON.stringify(args, null, 0)})
      </div>
      {result && (
        <details>
          <summary
            className={`px-2 my-1 truncate ${isError ? "text-red-700 dark:text-red-400" : "text-gray-600 dark:text-gray-400"}`}
          >
            &nbsp;↳ {truncateString(result, 300)}
          </summary>
          <div className="mt-1 p-1 break-all text-gray-500 dark:text-gray-500">
            <FullResultDetails result={result} />
          </div>
        </details>
      )}
    </details>
  );
}

/**
 *
 * @param root0
 * @param root0.result
 */
function FullResultDetails({ result }: { result: string }) {
  const s = `${result}`;
  let formatted: string | null = null;

  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s);
      formatted = JSON.stringify(obj, null, 2).replaceAll("\\n", "\n");
    } catch {
      // JSON parsing failed, will render as plain text
    }
  }

  if (formatted) {
    return <pre className="whitespace-pre-wrap">{formatted}</pre>;
  }
  return <>{s}</>;
}
