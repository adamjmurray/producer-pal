import { toolNames } from "../../../config.js";

export function AssistantToolCall({ name, args, result, isError }) {
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
            &nbsp;↳ {result}
          </summary>
          <div className="mt-1 p-1 break-all text-gray-500 dark:text-gray-500">
            <FullResultDetails result={result} />
          </div>
        </details>
      )}
    </details>
  );
}

function FullResultDetails({ result }) {
  let s = `${result}`;
  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s);
      return (
        <pre className="whitespace-pre-wrap">
          {JSON.stringify(obj, null, 2).replaceAll("\\n", "\n")}
        </pre>
      );
    } catch {}
  }
  return <>{s}</>;
}
