"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, MessageSquare, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markThreadRead, sendDirectMessage } from "@/features/messaging/actions";
import type { DirectMessage, InstructorMessageThread } from "@/features/messaging/types";
import { cn } from "@/lib/utils/cn";

const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "numeric",
  timeZone: "UTC",
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
  return isToday ? `${timeFormat.format(d)} UTC` : `${dateFormat.format(d)}, ${timeFormat.format(d)} UTC`;
}

export function ThreadConversation({
  thread,
  initialMessages,
}: {
  thread: InstructorMessageThread;
  initialMessages: DirectMessage[];
}) {
  const router = useRouter();
  // `messages` holds an optimistic append (handleSend) on top of the server's initialMessages
  // until the next refresh brings the authoritative list -- adjusted during render (React's
  // documented pattern for "reset state when a prop changes") rather than in an effect, since
  // initialMessages changing IS the signal to drop the optimistic overlay.
  const [prevInitialMessages, setPrevInitialMessages] = useState(initialMessages);
  const [messages, setMessages] = useState<DirectMessage[]>(initialMessages);
  if (initialMessages !== prevInitialMessages) {
    setPrevInitialMessages(initialMessages);
    setMessages(initialMessages);
  }
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Mark thread as read on mount if there are unread messages
  useEffect(() => {
    if (thread.unreadCount > 0) {
      markThreadRead(thread.threadId).then(() => {
        router.refresh();
      });
    }
  }, [thread.threadId, thread.unreadCount, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);

    const tempText = body.trim();
    const res = await sendDirectMessage(thread.threadId, tempText);
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setBody("");
    setMessages((prev) => [
      ...prev,
      {
        messageId: res.messageId,
        senderId: "me",
        senderName: "Me",
        body: tempText,
        readAt: null,
        createdAt: new Date().toISOString(),
        isMine: true,
      },
    ]);
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col bg-surface rounded-card border border-border overflow-hidden">
      {/* Thread Header */}
      <div className="flex items-center justify-between border-b border-border p-4 bg-surface-elevated/40">
        <div>
          <h2 className="text-base font-semibold text-text flex items-center gap-2">
            <User className="size-4 text-primary" aria-hidden="true" />
            {thread.learnerName}
          </h2>
          <p className="text-xs text-text-secondary">{thread.courseTitle}</p>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[500px]">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-8 text-text-secondary">
            <MessageSquare className="size-8 mb-2 opacity-40" aria-hidden="true" />
            <p className="text-sm">No messages in this conversation yet.</p>
            <p className="text-xs">Send a direct message below to start the conversation.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.messageId}
              className={cn("flex flex-col max-w-[80%]", m.isMine ? "ml-auto items-end" : "mr-auto items-start")}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
                  m.isMine
                    ? "bg-primary text-white rounded-br-xs"
                    : "bg-border-subtle text-text rounded-bl-xs border border-border/50",
                )}
              >
                {m.body}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-text-secondary px-1">
                <span>{formatMessageTime(m.createdAt)}</span>
                {m.isMine && (
                  <span>
                    {m.readAt ? (
                      <CheckCheck className="size-3 text-primary inline" aria-label="Read" />
                    ) : (
                      <Check className="size-3 inline" aria-label="Sent" />
                    )}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} aria-label="Send message" className="border-t border-border p-3 bg-surface">
        {error && <p role="alert" className="mb-2 text-xs text-danger-text">{error}</p>}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Message ${thread.learnerName}...`}
            className="flex-1 rounded-input border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-hidden"
            disabled={busy}
          />
          <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
            <Send className="size-3.5 mr-1" aria-hidden="true" />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ThreadList({
  threads,
  activeThreadId,
}: {
  threads: InstructorMessageThread[];
  activeThreadId?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = threads.filter(
    (t) =>
      t.learnerName.toLowerCase().includes(query.toLowerCase()) ||
      t.courseTitle.toLowerCase().includes(query.toLowerCase()) ||
      (t.lastMessage && t.lastMessage.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="flex flex-col h-full bg-surface rounded-card border border-border overflow-hidden">
      <div className="p-3 border-b border-border">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search learners or courses..."
          aria-label="Search conversations"
          className="w-full rounded-input border border-border bg-surface px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
        />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-xs text-text-secondary">
            {threads.length === 0 ? "No message threads yet." : "No matching conversations."}
          </p>
        ) : (
          filtered.map((t) => {
            const isActive = t.threadId === activeThreadId;
            return (
              <Link
                key={t.threadId}
                href={`/instructor/messages?thread=${t.threadId}`}
                className={cn(
                  "block p-3.5 transition-colors text-left",
                  isActive
                    ? "bg-primary-light/40 border-l-2 border-primary"
                    : "hover:bg-border-subtle",
                )}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={cn("text-sm truncate", t.unreadCount > 0 ? "font-bold text-text" : "font-medium text-text")}>
                    {t.learnerName}
                  </span>
                  {t.lastMessageAt && (
                    <span className="text-[11px] text-text-secondary shrink-0">
                      {dateFormat.format(new Date(t.lastMessageAt))}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary font-medium truncate mb-1">{t.courseTitle}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-text-secondary line-clamp-1 truncate">
                    {t.lastMessage || "No messages yet"}
                  </p>
                  {t.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-bold text-white">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
