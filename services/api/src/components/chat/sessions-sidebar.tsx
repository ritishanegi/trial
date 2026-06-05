"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, FileText, MoreHorizontal, Trash2, Pencil, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SESSIONS_UPDATED_EVENT } from "./chat-interface";

interface ChatSession {
  id: string;
  title: string;
  documentId: string | null;
  vesselId: string | null;
  documentTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionsSidebarProps {
  activeSessionId?: string;
}

/**
 * Left rail showing past chat sessions, grouped by recency.
 * Clicking a session navigates to /dashboard/query/[sessionId].
 */
export function SessionsSidebar({ activeSessionId }: SessionsSidebarProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch {
      // Network error — keep existing list
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
    // Refetch sessions when ChatInterface broadcasts a change
    // (new session created, title updated after first response, etc.)
    const handler = () => loadSessions();
    window.addEventListener(SESSIONS_UPDATED_EVENT, handler);
    // Also refetch when the tab becomes visible again — covers the case
    // where another tab created/deleted a session
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadSessions();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(SESSIONS_UPDATED_EVENT, handler);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadSessions]);

  async function handleDelete(sessionId: string) {
    if (!confirm("Delete this chat? This cannot be undone.")) return;
    const res = await fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      window.dispatchEvent(new Event(SESSIONS_UPDATED_EVENT));
      if (activeSessionId === sessionId) router.push("/dashboard/query");
    }
  }

  async function handleRename(sessionId: string, currentTitle: string) {
    const title = prompt("New title:", currentTitle);
    if (!title || title === currentTitle) return;
    const res = await fetch(`/api/chat/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
      window.dispatchEvent(new Event(SESSIONS_UPDATED_EVENT));
    }
  }

  const grouped = groupByRecency(sessions);

  return (
    <aside className="w-64 border-r border-border bg-muted/20 flex flex-col shrink-0 h-full">
      <div className="p-3 border-b border-border">
        <Button asChild size="sm" className="w-full justify-start" variant="outline">
          <Link href="/dashboard/query">
            <Plus className="size-4 mr-1.5" />
            New chat
          </Link>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No chats yet. Start a new conversation.
          </p>
        ) : (
          Object.entries(grouped).map(([groupLabel, items]) => (
            <div key={groupLabel}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 mb-1 font-medium">
                {groupLabel}
              </p>
              <div className="space-y-0.5">
                {items.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    active={session.id === activeSessionId}
                    onDelete={() => handleDelete(session.id)}
                    onRename={() => handleRename(session.id, session.title)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function SessionItem({
  session,
  active,
  onDelete,
  onRename,
}: {
  session: ChatSession;
  active: boolean;
  onDelete: () => void;
  onRename: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center rounded-md text-sm transition-colors",
        active ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      <Link
        href={`/dashboard/query/${session.id}`}
        className="flex-1 px-2 py-1.5 min-w-0 flex items-center gap-1.5"
      >
        {session.documentId && (
          <FileText className="size-3 text-muted-foreground shrink-0" />
        )}
        <span className="truncate text-foreground" title={session.title}>
          {session.title}
        </span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 mr-0.5 rounded hover:bg-background text-muted-foreground hover:text-foreground"
            aria-label="Session options"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="size-3.5 mr-2" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="size-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Group sessions by recency: Today / Yesterday / This week / Older.
 */
function groupByRecency(sessions: ChatSession[]): Record<string, ChatSession[]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400_000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 86400_000);

  const groups: Record<string, ChatSession[]> = {};
  for (const s of sessions) {
    const updated = new Date(s.updatedAt);
    let label: string;
    if (updated >= startOfToday) label = "Today";
    else if (updated >= startOfYesterday) label = "Yesterday";
    else if (updated >= startOfWeek) label = "This week";
    else label = "Older";

    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  }
  return groups;
}
