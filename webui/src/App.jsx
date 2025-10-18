import { marked } from "marked";
import { useEffect, useState } from "preact/hooks";

export function App() {
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load initial content
  useEffect(() => {
    setContent(window.mockData?.notes || "");
  }, []);

  // Auto-save simulation
  useEffect(() => {
    if (!content) return;
    const timer = setTimeout(() => {
      setSaving(true);
      setTimeout(() => setSaving(false), 500);
      console.log("Mock save:", content.slice(0, 50));
    }, 500);
    return () => clearTimeout(timer);
  }, [content]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-darker px-4 py-2 border-b border-border flex items-center">
        <h1 className="text-sm font-semibold">Producer Pal</h1>
        <span className="ml-2 text-xs opacity-60">Project Notes</span>
        <span className="ml-auto text-xs opacity-40">
          {saving ? "Saving..." : ""}
        </span>
      </header>

      {/* Toolbar */}
      <div className="bg-gray-800 px-4 py-2 border-b border-border">
        <button
          onClick={() => setPreview(!preview)}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          {preview ? "✏️ Edit" : "👁️ Preview"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {preview ? (
          <div
            className="h-full overflow-y-auto p-6 prose prose-invert max-w-none
                       prose-headings:text-blue-400 prose-h1:border-b prose-h1:border-border
                       prose-code:bg-gray-800 prose-code:text-orange-300
                       prose-blockquote:border-blue-600"
            dangerouslySetInnerHTML={{
              __html: marked(content || "*No content*"),
            }}
          />
        ) : (
          <textarea
            value={content}
            onInput={(e) => setContent(e.target.value)}
            className="w-full h-full p-6 bg-dark text-gray-300
                       font-mono text-sm leading-relaxed
                       resize-none outline-none"
            placeholder="Enter project notes (Markdown supported)..."
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
