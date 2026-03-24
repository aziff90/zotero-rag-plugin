import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BasicTool } from "zotero-plugin-toolkit";
import { extractTextFromItems } from "./rag/extractor";
import { chunkText } from "./rag/chunker";
import { VectorStore } from "./rag/vectorstore";
import { LLMClient } from "./rag/llm";
import ReactMarkdown from "react-markdown";
import { getPref } from "./utils/prefs";

const ztoolkit = new BasicTool();
// @ts-expect-error type override
const Zotero = window.Zotero || window.opener?.Zotero;

const ChatApp = () => {
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([
    {
      role: "assistant",
      text: "Hello! I am ready to chat about your selected documents. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Initializing RAG backend...");

  const vectorStoreRef = useRef<VectorStore>(new VectorStore());
  const llmClientRef = useRef<LLMClient | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const initRAG = async () => {
      let ids: number[] = [];
      // @ts-expect-error type override
      if (window.arguments && window.arguments.length > 0) {
        // @ts-expect-error type override
        ids = window.arguments[0].itemIds || [];
      }

      if (ids.length === 0) {
        setStatus("No items selected. Please select items in Zotero first.");
        return;
      }

      setStatus(`Loading ${ids.length} items from Zotero...`);
      try {
        const items = await Zotero.Items.getAsync(ids);

        setStatus("Extracting PDF text and performing OCR if necessary...");
        const extracted = await extractTextFromItems(items);

        setStatus("Chunking text...");
        const chunks = chunkText(extracted, 300, 50);

        setStatus(`Generating embeddings for ${chunks.length} chunks...`);
        setProgress(1); // Show progress bar

        await vectorStoreRef.current.addChunks(chunks, (info: any) => {
          if (info.progress) {
            setProgress(info.progress);
            if (info.status === "downloading")
              setStatus(
                `Downloading Local Embedding Model: ${Math.round(info.progress)}%`,
              );
            else if (info.status === "chunking")
              setStatus(`Embedding text chunks: ${Math.round(info.progress)}%`);
          }
        });

        setProgress(0); // Hide Progress bar
        setStatus(
          `Ready! Loaded ${chunks.length} chunks from ${extracted.length} documents.`,
        );
        setIsReady(true);
      } catch (err: any) {
        setProgress(0);
        setStatus(`Error initializing: ${err.message}`);
        ztoolkit.log("RAG Init Error", err);
      }
    };

    initRAG();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !isReady) return;

    const currentProvider = (getPref("provider") as any) || "gemini";
    const currentApiKey = (getPref("apiKey") as string) || "";
    const currentModel = (getPref("model") as string) || "gemini-2.5-flash";
    const currentBaseUrl =
      (getPref("baseUrl") as string) || "http://localhost:11434";

    if (currentProvider !== "ollama" && !currentApiKey) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Please configure your API Key in Zotero Preferences > RAG Assistant Settings first!",
        },
      ]);
      return;
    }

    llmClientRef.current = new LLMClient({
      provider: currentProvider,
      apiKey: currentApiKey,
      model: currentModel,
      baseUrl: currentBaseUrl,
    });

    const userMessage = input;
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setInput("");

    // Add placeholder for assistant message
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "Searching documents..." },
    ]);

    try {
      const results = await vectorStoreRef.current.search(userMessage, 15);

      // Group results by document key so context is cleaner
      const docGroups: Record<
        string,
        { title: string; itemKey: string; texts: string[] }
      > = {};
      results.forEach((r) => {
        const key = r.chunk.itemKey;
        if (!docGroups[key])
          docGroups[key] = { title: r.chunk.title, itemKey: key, texts: [] };
        docGroups[key].texts.push(r.chunk.text);
      });
      const usedSourceKeys = Object.keys(docGroups);
      // Create context blocks explicitly numbered
      const contextTexts = usedSourceKeys.map(
        (key, idx) =>
          `Source [${idx + 1}]: ${docGroups[key].title}\nContent:\n${docGroups[key].texts.join("\n...\n")}`,
      );

      setMessages((prev) => {
        const newMsg = [...prev];
        newMsg[newMsg.length - 1] = { role: "assistant", text: "" };
        return newMsg;
      });

      let responseText = "";
      await llmClientRef.current.generate(
        userMessage,
        contextTexts,
        (chunk) => {
          responseText += chunk;
          setMessages((prev) => {
            const newMsg = [...prev];
            newMsg[newMsg.length - 1] = {
              role: "assistant",
              text: responseText,
            };
            return newMsg;
          });
        },
      );

      // Append citations
      if (usedSourceKeys.length > 0) {
        responseText +=
          "\n\n---\n**Documents Referenced:**\n\n" +
          usedSourceKeys
            .map(
              (key, i) =>
                `**[${i + 1}]** [${docGroups[key].title}](zotero://select/library/items/${key})`,
            )
            .join("\n\n");

        setMessages((prev) => {
          const newMsg = [...prev];
          newMsg[newMsg.length - 1] = { role: "assistant", text: responseText };
          return newMsg;
        });
      }
    } catch (err: any) {
      setMessages((prev) => {
        const newMsg = [...prev];
        newMsg[newMsg.length - 1] = {
          role: "assistant",
          text: `Error: ${err.message}`,
        };
        return newMsg;
      });
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
      }}
    >
      <style>{`
        .markdown-body p { margin-top: 0; margin-bottom: 0.8em; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body ul, .markdown-body ol { margin-top: 0; margin-bottom: 0.8em; padding-left: 20px; }
        .markdown-body li { margin-bottom: 0.3em; }
        .markdown-body pre { background: var(--panel-bg); padding: 10px; border-radius: 6px; overflow-x: auto; }
        .markdown-body code { background: rgba(128,128,128,0.2); padding: 2px 4px; border-radius: 4px; }
      `}</style>
      <header
        style={{
          padding: "12px 20px",
          background: "var(--panel-bg)",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px" }}>RAG Research Assistant</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", color: "#888" }}>{status}</span>
        </div>
      </header>

      {/* Progress bar */}
      {progress > 0 && progress < 100 && (
        <div
          style={{
            width: "100%",
            height: "4px",
            background: "var(--border-color)",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "#007aff",
              transition: "width 0.2s",
            }}
          />
        </div>
      )}

      <main style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: "16px",
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              className={m.role === "assistant" ? "markdown-body" : ""}
              style={{
                background: m.role === "user" ? "#007aff" : "var(--bubble-bg)",
                color: m.role === "user" ? "#fff" : "var(--text-color)",
                padding: "12px 16px",
                borderRadius: "12px",
                maxWidth: "75%",
                border:
                  m.role === "assistant"
                    ? "1px solid var(--border-color)"
                    : "none",
                boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                whiteSpace: m.role === "user" ? "pre-wrap" : "normal",
                lineHeight: "1.5",
              }}
            >
              {m.role === "user" ? (
                m.text
              ) : (
                <ReactMarkdown
                  urlTransform={(url) =>
                    url.startsWith("zotero://") ? url : url
                  }
                >
                  {m.text}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
      </main>

      <footer
        style={{
          padding: "16px",
          background: "var(--panel-bg)",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <textarea
          style={{
            flex: 1,
            padding: "12px",
            border: "1px solid var(--input-border)",
            background: "var(--panel-bg)",
            color: "var(--text-color)",
            borderRadius: "8px",
            fontSize: "14px",
            outline: "none",
            resize: "none",
            overflowY: "auto",
            minHeight: "20px",
            maxHeight: "150px",
          }}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
              e.currentTarget.style.height = "auto";
            }
          }}
          placeholder="Ask a question... (Shift+Enter for new line)"
          disabled={!isReady}
        />
        <button
          style={{
            marginLeft: "12px",
            padding: "0 20px",
            background: isReady ? "#007aff" : "#ccc",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: isReady ? "pointer" : "not-allowed",
            fontWeight: "bold",
          }}
          onClick={handleSend}
          disabled={!isReady}
        >
          Send
        </button>
      </footer>
    </div>
  );
};

try {
  // @ts-expect-error type override
  const rootEl = document.getElementById("root");
  if (rootEl) {
    const root = createRoot(rootEl);
    root.render(<ChatApp />);
  }
} catch (e: any) {
  // @ts-expect-error type override
  const errDiv = document.createElement("div");
  errDiv.style.color = "red";
  errDiv.style.padding = "20px";
  errDiv.innerHTML = `<h3>Error Initializing Chat UI</h3><pre>${e.stack || e.message || String(e)}</pre>`;
  // @ts-expect-error type override
  document.body.appendChild(errDiv);
}
