"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ChatInterface } from "@/components/chat/chat-interface";

/**
 * New-chat page. No sessionId yet — ChatInterface creates one on first send,
 * then updates the URL to /dashboard/query/[sessionId] via history.replaceState.
 *
 * Optional URL params for jumping in with a doc scope:
 *   ?docId=<uuid>&docTitle=<title>  → starts a doc-scoped chat
 */
export default function NewChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NewChatInner />
    </Suspense>
  );
}

function NewChatInner() {
  const searchParams = useSearchParams();
  const docId = searchParams.get("docId");
  const docTitle = searchParams.get("docTitle");

  return (
    <ChatInterface
      scopedDocumentId={docId}
      scopedDocumentTitle={docTitle}
    />
  );
}
