import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatSource {
  document_id: string;
  title: string;
  page_number: number | null;
  scope: 'vessel' | 'fleet' | 'master';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  /** True while a streaming response is still being received */
  streaming?: boolean;
  /** Base64 data URL for an uploaded image (user messages only) */
  imageUrl?: string | null;
  timestamp: number;
}

export interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  /** Optional scoped document — restricts RAG to one document */
  scopedDocumentId: string | null;
  scopedDocumentTitle: string | null;
}

interface ChatStoreState {
  // ── Session state ──────────────────────────────────────────────────
  sessions: Record<string, ChatSession>;
  activeSessionId: string | null;

  // ── UI transient state ────────────────────────────────────────────
  /** True while a streaming request is in-flight */
  isLoading: boolean;
  /** Non-null when the latest request failed */
  error: string | null;

  // ── Computed helpers ───────────────────────────────────────────────
  activeSession: () => ChatSession | null;
  activeMessages: () => ChatMessage[];
}

interface ChatStoreActions {
  // ── Session management ────────────────────────────────────────────
  createSession: (opts?: {
    sessionId?: string;
    scopedDocumentId?: string | null;
    scopedDocumentTitle?: string | null;
  }) => string;
  setActiveSession: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;
  clearAllSessions: () => void;

  // ── Message lifecycle ─────────────────────────────────────────────
  /** Add a complete message (user turn or final assistant turn) */
  addMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;

  /** Begin streaming: adds an empty assistant message and returns its id */
  beginStreamingMessage: (sessionId: string) => string;

  /** Append a text token to an in-progress streaming message */
  appendToken: (sessionId: string, messageId: string, token: string) => void;

  /** Finalize the streaming message: set sources and mark streaming=false */
  finalizeStreamingMessage: (
    sessionId: string,
    messageId: string,
    sources: ChatSource[],
  ) => void;

  // ── UI state ──────────────────────────────────────────────────────
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

type ChatStore = ChatStoreState & ChatStoreActions;

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()(
  devtools(
    persist(
      (set, get) => ({
        // ── Initial state ────────────────────────────────────────────
        sessions: {},
        activeSessionId: null,
        isLoading: false,
        error: null,

        // ── Computed helpers ─────────────────────────────────────────
        activeSession: () => {
          const { sessions, activeSessionId } = get();
          return activeSessionId ? (sessions[activeSessionId] ?? null) : null;
        },

        activeMessages: () => {
          const session = get().activeSession();
          return session?.messages ?? [];
        },

        // ── Session management ───────────────────────────────────────
        createSession: (opts = {}) => {
          const sessionId = opts.sessionId ?? generateId();
          set(
            (state) => ({
              sessions: {
                ...state.sessions,
                [sessionId]: {
                  sessionId,
                  messages: [],
                  scopedDocumentId: opts.scopedDocumentId ?? null,
                  scopedDocumentTitle: opts.scopedDocumentTitle ?? null,
                },
              },
              activeSessionId: sessionId,
            }),
            false,
            'createSession',
          );
          return sessionId;
        },

        setActiveSession: (sessionId) => {
          set({ activeSessionId: sessionId }, false, 'setActiveSession');
        },

        clearSession: (sessionId) => {
          set(
            (state) => {
              const { [sessionId]: _removed, ...rest } = state.sessions;
              return {
                sessions: rest,
                activeSessionId:
                  state.activeSessionId === sessionId ? null : state.activeSessionId,
              };
            },
            false,
            'clearSession',
          );
        },

        clearAllSessions: () => {
          set({ sessions: {}, activeSessionId: null }, false, 'clearAllSessions');
        },

        // ── Message lifecycle ────────────────────────────────────────
        addMessage: (sessionId, messageData) => {
          const id = generateId();
          const message: ChatMessage = { ...messageData, id, timestamp: Date.now() };
          set(
            (state) => {
              const session = state.sessions[sessionId];
              if (!session) return state;
              return {
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...session,
                    messages: [...session.messages, message],
                  },
                },
              };
            },
            false,
            'addMessage',
          );
          return id;
        },

        beginStreamingMessage: (sessionId) => {
          const id = generateId();
          set(
            (state) => {
              const session = state.sessions[sessionId];
              if (!session) return state;
              const streamingMsg: ChatMessage = {
                id,
                role: 'assistant',
                content: '',
                streaming: true,
                timestamp: Date.now(),
              };
              return {
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...session,
                    messages: [...session.messages, streamingMsg],
                  },
                },
              };
            },
            false,
            'beginStreamingMessage',
          );
          return id;
        },

        appendToken: (sessionId, messageId, token) => {
          set(
            (state) => {
              const session = state.sessions[sessionId];
              if (!session) return state;
              return {
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...session,
                    messages: session.messages.map((msg) =>
                      msg.id === messageId
                        ? { ...msg, content: msg.content + token }
                        : msg,
                    ),
                  },
                },
              };
            },
            false,
            'appendToken',
          );
        },

        finalizeStreamingMessage: (sessionId, messageId, sources) => {
          set(
            (state) => {
              const session = state.sessions[sessionId];
              if (!session) return state;
              return {
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...session,
                    messages: session.messages.map((msg) =>
                      msg.id === messageId
                        ? { ...msg, streaming: false, sources }
                        : msg,
                    ),
                  },
                },
              };
            },
            false,
            'finalizeStreamingMessage',
          );
        },

        // ── UI state ─────────────────────────────────────────────────
        setLoading: (isLoading) => set({ isLoading }, false, 'setLoading'),
        setError: (error) => set({ error }, false, 'setError'),
      }),
      {
        name: 'nautos-chat-store',
        // Only persist session history, not transient UI state
        partialize: (state) => ({
          sessions: state.sessions,
          activeSessionId: state.activeSessionId,
        }),
      },
    ),
    { name: 'ChatStore' },
  ),
);
