"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Loader2, FileText, X } from "lucide-react";
import { Message } from "@/components/chat/message";

export interface Source {
  document_id: string;
  title: string;
  page_number: number | null;
  scope: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface VesselOption {
  id: string;
  name: string;
}

interface ChatInterfaceProps {
  /** If set, posts to /api/query with this sessionId so messages persist. */
  sessionId?: string | null;
  /** Initial conversation loaded from DB (when opening an existing session). */
  initialMessages?: ChatMessage[];
  /** Lock the chat to one document — passed to RAG as documentId. */
  scopedDocumentId?: string | null;
  scopedDocumentTitle?: string | null;
  /** Called when the first message of a new chat creates a session. */
  onSessionCreated?: (sessionId: string) => void;
}

const DEFAULT_SUGGESTIONS = [
  "What is the overhaul interval for the turbocharger?",
  "List the spare parts for the main engine fuel injector",
  "Safety procedures for enclosed space entry",
  "Torque specifications for cylinder head bolts",
];

const SCOPED_SUGGESTIONS = [
  "Summarize this document",
  "List all parts in this document with their part numbers",
  "What are the key specifications?",
  "What maintenance procedures are described?",
];

/**
 * Shared chat UI used by both /dashboard/query and /dashboard/query/[sessionId].
 *
 * Handles three modes:
 * 1. Fresh chat (no sessionId, no scope) — creates a session on first send,
 *    then updates URL via history.replaceState so subsequent sends persist.
 * 2. Existing session (sessionId provided) — loads initialMessages, sends with
 *    sessionId so the server persists the conversation.
 * 3. Doc-scoped chat (scopedDocumentId provided) — creates session linked to
 *    that document on first send.
 */
/** Custom event the sidebar listens for to refetch its session list. */
export const SESSIONS_UPDATED_EVENT = "nautos:sessions-updated";

export function ChatInterface({
  sessionId: initialSessionId = null,
  initialMessages = [],
  scopedDocumentId = null,
  scopedDocumentTitle = null,
  onSessionCreated,
}: ChatInterfaceProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [vesselId, setVesselId] = useState<string>("all");
  const [vesselOptions, setVesselOptions] = useState<VesselOption[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Lock initial scope in state so URL changes (history.replaceState after
  // session creation) don't blank out the scope pill. The session in the DB
  // is permanently bound to this doc anyway — UX should reflect that.
  const [activeDocumentId] = useState<string | null>(scopedDocumentId);
  const [activeDocumentTitle] = useState<string | null>(scopedDocumentTitle);
  const isScoped = Boolean(activeDocumentId);

  // Fetch vessel options (only relevant in unscoped mode)
  useEffect(() => {
    if (isScoped) return;
    fetch("/api/vessels")
      .then((res) => res.json())
      .then((data) => setVesselOptions(data.vessels || []))
      .catch(() => {});
  }, [isScoped]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function clearScope() {
    router.push("/dashboard/query");
  }

  /**
   * Ensure we have a session before persisting messages.
   * Returns the session id (existing or newly created).
   */
  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId;
    try {
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: activeDocumentId,
          vesselId: !isScoped && vesselId !== "all" ? vesselId : undefined,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const newId = data.session.id;
      setSessionId(newId);
      // Update URL without triggering re-render so the user can bookmark
      window.history.replaceState(null, "", `/dashboard/query/${newId}`);
      // Tell the sidebar to refetch its session list — a new entry exists now
      window.dispatchEvent(new Event(SESSIONS_UPDATED_EVENT));
      onSessionCreated?.(newId);
      return newId;
    } catch {
      return null;
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || streaming) return;

    const question = input.trim();
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    // Optimistically render user message + placeholder
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "", sources: [] },
    ]);
    setStreaming(true);

    let assistantContent = "";
    let sources: Source[] = [];

    try {
      // Create session if needed (for any chat that should persist)
      const activeSessionId = await ensureSession();

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          sessionId: activeSessionId,
          // Scope hints: server prefers session's own doc/vessel if set
          documentId: activeDocumentId || undefined,
          vesselId: !isScoped && vesselId !== "all" ? vesselId : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Something went wrong. Please try again.",
          };
          return updated;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "text") {
              assistantContent += data.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  sources,
                };
                return updated;
              });
            } else if (data.type === "sources") {
              sources = data.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  sources,
                };
                return updated;
              });
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Connection error. Check your network and try again.",
        };
        return updated;
      });
    }
    setStreaming(false);

    // Stream is done — the server may have updated the session title (from
    // "New chat" to a snippet of the first question). Tell the sidebar to
    // refetch so the new title shows up immediately.
    if (sessionId) {
      window.dispatchEvent(new Event(SESSIONS_UPDATED_EVENT));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const suggestedQuestions = isScoped ? SCOPED_SUGGESTIONS : DEFAULT_SUGGESTIONS;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-5 h-12 flex items-center justify-between shrink-0">
        <h1 className="text-sm font-semibold text-foreground">Ask AI</h1>
        {isScoped ? (
          <div className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-full pl-2.5 pr-1 py-0.5 text-xs">
            <FileText className="size-3 text-muted-foreground" />
            <span
              className="font-medium text-foreground truncate max-w-[200px]"
              title={scopedDocumentTitle ?? ""}
            >
              {scopedDocumentTitle ?? "Document"}
            </span>
            <button
              onClick={clearScope}
              className="ml-0.5 size-5 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear document scope"
              title="Ask across all documents instead"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <Select value={vesselId} onValueChange={setVesselId}>
            <SelectTrigger className="w-44 h-7 text-xs">
              <SelectValue placeholder="All vessels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vessels</SelectItem>
              {vesselOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="py-16">
              <h2 className="text-lg font-semibold text-foreground">
                {isScoped
                  ? `Ask about "${scopedDocumentTitle ?? "this document"}"`
                  : "What do you want to know?"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                {isScoped
                  ? "Answers come only from this document — no mixing with other docs."
                  : "Ask about maintenance procedures, part numbers, or any technical detail in your documents."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      inputRef.current?.focus();
                    }}
                    className="text-left px-3 py-2.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLastAssistant =
              msg.role === "assistant" && i === messages.length - 1;
            if (msg.role === "assistant" && !msg.content && streaming && isLastAssistant) {
              return (
                <div key={i} className="max-w-[90%]">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    Thinking...
                  </span>
                </div>
              );
            }
            return (
              <Message
                key={i}
                role={msg.role}
                content={msg.content}
                sources={msg.sources}
                streaming={streaming && isLastAssistant}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              aria-label="Ask a question about your documents"
              disabled={streaming}
              rows={1}
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 max-h-[120px]"
              style={{ minHeight: "40px" }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={streaming || !input.trim()}
              className="shrink-0 m-1 size-7"
              variant="ghost"
            >
              {streaming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
