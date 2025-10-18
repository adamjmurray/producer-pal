import { marked } from "marked";
import { useEffect, useState } from "preact/hooks";

export function App() {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState("system"); // "light" | "dark" | "system"

  // Load initial content
  useEffect(() => {
    // Check if running in Max/jweb context
    if (window.max) {
      // Bind inlet to receive notes from Max
      // Max should send: "setNotes <content>" to the jweb object
      window.max.bindInlet("setNotes", (notes) => {
        setContent(notes || "");
      });
    } else {
      // Fallback for browser dev mode
      setContent(window.mockData?.notes || "");
    }
  }, []);

  // Auto-save: send updates to Max or simulate save in dev mode
  useEffect(() => {
    if (!content) return;
    const timer = setTimeout(() => {
      setSaving(true);
      if (window.max) {
        // Send update to Max
        window.max.outlet("v8", "projectNotes", content);
      } else {
        // Mock save for browser dev mode
        console.log("Mock save:", content.slice(0, 50));
      }
      setTimeout(() => setSaving(false), 500);
    }, 500);
    return () => clearTimeout(timer);
  }, [content]);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      if (theme === "system") {
        root.classList.toggle("dark", mediaQuery.matches);
      } else {
        root.classList.toggle("dark", theme === "dark");
      }
    };

    applyTheme();

    // Listen for system theme changes when in "system" mode
    if (theme === "system") {
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center">
        <h1 className="text-lg font-semibold">Producer Pal</h1>
        <span className="ml-2 text-xs opacity-60">Project Notes</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs opacity-40">
            {saving ? "Saving..." : ""}
          </span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="text-xs bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>

      {/* Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col border-r border-gray-300 dark:border-gray-700">
          <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 text-xs opacity-60">
            Edit
          </div>
          <textarea
            value={content}
            onInput={(e) => setContent(e.target.value)}
            className="flex-1 w-full p-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-300
                       font-mono text-sm leading-relaxed
                       resize-none outline-none"
            placeholder="Enter project notes (Markdown supported)..."
            spellCheck={false}
          />
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col">
          <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 text-xs opacity-60">
            Preview
          </div>
          <div
            className="flex-1 overflow-y-auto p-6 prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: marked(content) }}
          />
        </div>
      </div>
    </div>
  );
}
