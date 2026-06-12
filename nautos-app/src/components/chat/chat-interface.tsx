"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
import { Send, Loader2, FileText, X, Mic, MicOff, Square, ImagePlus } from "lucide-react";
import { Message } from "@/components/chat/message";
import { cn } from "@/lib/utils";

// ... (Keep existing interfaces and constants here exactly as they were) ...
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
  imageUrl?: string | null;
}

interface VesselOption {
  id: string;
  name: string;
}

interface ChatInterfaceProps {
  sessionId?: string | null;
  initialMessages?: ChatMessage[];
  scopedDocumentId?: string | null;
  scopedDocumentTitle?: string | null;
  onSessionCreated?: (sessionId: string) => void;
}

// ── Voice state machine & Types ──────────────────────────────────────────────
type VoiceState = "idle" | "listening" | "unsupported";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
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

export const SESSIONS_UPDATED_EVENT = "nautos:sessions-updated";

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

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

  // ── Image Upload State ─────────────────────────────────────────────────────
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Voice state ────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [activeDocumentId] = useState<string | null>(scopedDocumentId);
  const [activeDocumentTitle] = useState<string | null>(scopedDocumentTitle);
  const isScoped = Boolean(activeDocumentId);

  useEffect(() => {
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) setVoiceState("unsupported");
  }, []);

  useEffect(() => {
    if (isScoped) return;
    fetch("/api/vessels")
      .then((res) => res.json())
      .then((data) => setVesselOptions(data.vessels || []))
      .catch(() => { });
  }, [isScoped]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  // ── NEW: Handle Paste Event ────────────────────────────────────────────────
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Check if the pasted item is an image
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault(); // Prevent default text paste behavior
        const file = item.getAsFile();
        if (file) {
          if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
          setSelectedImage(file);
          setImagePreviewUrl(URL.createObjectURL(file));
          return; // Stop looking after the first image is found
        }
      }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);

    setSelectedImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ... (Keep the rest of your voice handlers, ensureSession, and API calls exactly the same) ...
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceState("idle");
    setInterimTranscript("");
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new (SpeechRecognition as new () => SpeechRecognitionInstance)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      if (finalText) {
        setInput((prev) => {
          const base = prev.trim();
          return base ? `${base} ${finalText.trim()}` : finalText.trim();
        });
        setInterimTranscript("");
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
          inputRef.current.style.height =
            Math.min(inputRef.current.scrollHeight, 120) + "px";
        }
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = () => stopListening();
    recognition.onend = () => {
      setVoiceState((s) => (s === "listening" ? "idle" : s));
      setInterimTranscript("");
    };

    recognition.start();
    recognitionRef.current = recognition;
    setVoiceState("listening");
  }, [stopListening]);

  const toggleVoice = useCallback(() => {
    if (voiceState === "listening") {
      stopListening();
    } else {
      startListening();
    }
  }, [voiceState, startListening, stopListening]);

  function clearScope() {
    router.push("/dashboard/query");
  }

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
      window.history.replaceState(null, "", `/dashboard/query/${newId}`);
      window.dispatchEvent(new Event(SESSIONS_UPDATED_EVENT));
      onSessionCreated?.(newId);
      return newId;
    } catch {
      return null;
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if ((!input.trim() && !selectedImage) || streaming) return;

    if (voiceState === "listening") stopListening();

    const question = input.trim();
    const currentPreviewUrl = imagePreviewUrl;

    let base64Image: string | null = null;
    if (selectedImage) {
      try {
        base64Image = await fileToBase64(selectedImage);
      } catch (err) {
        console.error("Failed to convert image to base64", err);
      }
    }

    setInput("");
    removeSelectedImage();
    if (inputRef.current) inputRef.current.style.height = "auto";

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question, imageUrl: currentPreviewUrl },
      { role: "assistant", content: "", sources: [] },
    ]);
    setStreaming(true);

    let assistantContent = "";
    let sources: Source[] = [];

    try {
      const activeSessionId = await ensureSession();

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          image: base64Image,
          sessionId: activeSessionId,
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
            // ignore
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
  const isListening = voiceState === "listening";

  return (
    <div className="flex flex-col h-full bg-[#0d1a2e]">
      {/* Header */}
      <div className="border-b border-white/[0.07] px-5 h-12 flex items-center justify-between shrink-0 bg-[#0a1628]">
        <h1 className="text-sm font-semibold text-[#f0f4ff]">Ask AI</h1>
        {isScoped ? (
          <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.08] rounded-full pl-2.5 pr-1 py-0.5 text-xs">
            <FileText className="size-3 text-white/40" />
            <span
              className="font-medium text-[#c8deff] truncate max-w-[200px]"
              title={scopedDocumentTitle ?? ""}
            >
              {scopedDocumentTitle ?? "Document"}
            </span>
            <button
              onClick={clearScope}
              className="ml-0.5 size-5 inline-flex items-center justify-center rounded-full hover:bg-white/[0.07] text-white/40 hover:text-white/80 transition-colors"
              aria-label="Clear document scope"
              title="Ask across all documents instead"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <Select value={vesselId} onValueChange={setVesselId}>
            <SelectTrigger className="w-44 h-7 text-xs bg-white/[0.03] border-white/[0.1] text-white/70">
              <SelectValue placeholder="All vessels" />
            </SelectTrigger>
            <SelectContent className="bg-[#0d1a2e] border-white/[0.1] text-white/70">
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
              <h2 className="text-lg font-semibold text-[#f0f4ff]">
                {isScoped
                  ? `Ask about "${scopedDocumentTitle ?? "this document"}"`
                  : "What do you want to know?"}
              </h2>
              <p className="text-sm text-white/40 mt-1 mb-6">
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
                    className="text-left px-3 py-2.5 rounded-md border border-white/[0.08] text-sm text-white/50 hover:text-[#f0f4ff] hover:border-white/20 transition-colors bg-white/[0.02] hover:bg-white/[0.05]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
            if (msg.role === "assistant" && !msg.content && streaming && isLastAssistant) {
              return (
                <div key={i} className="max-w-[90%]">
                  <span className="text-sm text-white/40 flex items-center gap-1.5">
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
                imageUrl={msg.imageUrl}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-white/[0.07] p-4 shrink-0 bg-[#0a1628]">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-2">

          {imagePreviewUrl && (
            <div className="relative inline-block mb-2">
              <img
                src={imagePreviewUrl}
                alt="Upload preview"
                className="h-20 w-auto rounded-md border border-white/[0.1] object-cover"
              />
              <button
                type="button"
                onClick={removeSelectedImage}
                className="absolute -top-2 -right-2 bg-[#f5a623] text-[#0a1628] rounded-full p-0.5 hover:bg-[#e8971a] transition-colors"
                aria-label="Remove image"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <div
            className={cn(
              "flex items-end gap-2 rounded-lg border bg-white/[0.03] transition-colors",
              isListening
                ? "border-[#f5a623]/40 ring-1 ring-[#f5a623]/20"
                : "border-white/[0.1] focus-within:border-[#f5a623]/40"
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageSelect}
              disabled={streaming}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title="Attach an image"
              className="shrink-0 m-1 size-8 rounded-md flex items-center justify-center transition-all text-white/30 hover:text-[#f5a623] hover:bg-[#f5a623]/10 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ImagePlus className="size-4" />
            </button>

            <button
              type="button"
              onClick={toggleVoice}
              disabled={streaming || voiceState === "unsupported"}
              title="Voice input"
              className={cn(
                "shrink-0 my-1 mr-1 size-8 rounded-md flex items-center justify-center transition-all disabled:opacity-40 disabled:pointer-events-none",
                isListening
                  ? "text-[#f5a623] bg-[#f5a623]/10 animate-pulse"
                  : "text-white/30 hover:text-[#f5a623] hover:bg-[#f5a623]/10"
              )}
            >
              {isListening ? <Square className="size-4 fill-current" /> : <Mic className="size-4" />}
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isListening ? "Speak now…" : "Ask a question or paste an image..."
              }
              aria-label="Ask a question about your documents"
              disabled={streaming}
              rows={1}
              className="flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-[#f0f4ff] placeholder:text-white/25 focus:outline-none disabled:opacity-50 max-h-[120px]"
              style={{ minHeight: "40px" }}
            />

            <Button
              type="submit"
              size="icon"
              disabled={streaming || (!input.trim() && !selectedImage)}
              className="shrink-0 m-1 size-8 bg-[#f5a623] text-[#0a1628] hover:bg-[#e8971a] disabled:bg-white/[0.05] disabled:text-white/20"
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