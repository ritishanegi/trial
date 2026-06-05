"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ChatInterface, ChatMessage } from "@/components/chat/chat-interface";

interface SessionData {
  id: string;
  title: string;
  documentId: string | null;
  documentTitle: string | null;
}

interface DBMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatMessage["sources"] | null;
}

/**
 * Loads an existing chat session by ID and hands it off to ChatInterface
 * pre-populated with its message history. Sends are persisted server-side
 * because sessionId is provided.
 */
export default function SessionChatPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = typeof params?.sessionId === "string" ? params.sessionId : "";

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/chat/sessions/${sessionId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) throw new Error("Failed to load session");
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setSession(data.session);
        setMessages(
          (data.messages as DBMessage[]).map((m) => ({
            role: m.role,
            content: m.content,
            sources: m.sources ?? undefined,
          }))
        );
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-muted-foreground">Chat not found.</p>
        <button
          onClick={() => router.push("/dashboard/query")}
          className="text-sm text-foreground underline"
        >
          Start a new chat
        </button>
      </div>
    );
  }

  return (
    <ChatInterface
      sessionId={session.id}
      initialMessages={messages}
      scopedDocumentId={session.documentId}
      scopedDocumentTitle={session.documentTitle}
    />
  );
}
