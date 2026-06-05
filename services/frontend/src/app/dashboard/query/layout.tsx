"use client";

import { useParams } from "next/navigation";
import { SessionsSidebar } from "@/components/chat/sessions-sidebar";

/**
 * Layout shared across all /dashboard/query/* routes.
 * Adds the chat sessions sidebar on the left.
 */
export default function QueryLayout({ children }: { children: React.ReactNode }) {
  // useParams in a layout returns whatever the active child route exposes;
  // /dashboard/query/[sessionId] exposes `sessionId`, root /dashboard/query is undefined.
  const params = useParams();
  const activeSessionId = typeof params?.sessionId === "string" ? params.sessionId : undefined;

  return (
    <div className="flex h-full">
      <SessionsSidebar activeSessionId={activeSessionId} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
