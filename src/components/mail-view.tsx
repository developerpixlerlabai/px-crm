"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CornerUpLeft,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Star,
  Tag,
} from "lucide-react";

import { MailMessageBody } from "@/components/mail-message-body";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatMailDate,
  formatMailDateFull,
  formatRelative,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type ThreadSummary = {
  threadId: string;
  mailboxId: string;
  mailboxAddress: string;
  subject: string;
  counterpartyName: string;
  counterparty: string;
  snippet: string;
  lastMessageAt: string | null;
  messageCount: number;
  lastFromMe: boolean;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  labelIds: string[];
};

export type ThreadMessage = {
  id: string;
  fromName: string;
  from: string;
  to: string;
  subject: string;
  sentAt: string | null;
  bodyHtml: string | null;
  quotedHtml: string | null;
  hasBlockedImages: boolean;
  hasAttachment: boolean;
  direction: "inbound" | "outbound";
};

export type ThreadDetail = {
  threadId: string;
  mailboxId: string;
  mailboxAddress: string;
  subject: string;
  messages: ThreadMessage[];
};

/** Deterministic avatar tint, so a correspondent keeps their colour. */
const AVATAR_TINTS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200",
];

function tintFor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

function initialsOf(label: string): string {
  const cleaned = label.replace(/[<>"]/g, "").trim();
  const words = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? cleaned).slice(0, 2).toUpperCase();
}

function Avatar({ label, size = "md" }: { label: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-content-center rounded-full font-semibold",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-[11px]",
        tintFor(label),
      )}
    >
      {initialsOf(label)}
    </span>
  );
}

type Selection = { kind: "all" } | { kind: "label"; id: string } | { kind: "mailbox"; id: string };

/**
 * The in-scope mail list, at Gmail's density.
 *
 * There is no "all mail" view by construction: the server only reads threads
 * carrying a label the mailbox was explicitly scoped to.
 *
 * All data arrives as props — the parent fetches on the tab click, keeping this
 * component effect-free.
 */
export function MailView({
  threads,
  labels,
  loading,
  detail,
  detailLoading,
  detailError,
  onRefresh,
  onOpenThread,
  onCloseThread,
  openSummary,
}: {
  threads: ThreadSummary[] | null;
  labels: Record<string, string>;
  loading: boolean;
  detail: ThreadDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onRefresh: () => void;
  onOpenThread: (thread: ThreadSummary) => void;
  onCloseThread: () => void;
  openSummary: ThreadSummary | null;
}) {
  const [selection, setSelection] = useState<Selection>({ kind: "all" });

  const mailboxes = useMemo(
    () => [...new Set((threads ?? []).map((t) => t.mailboxAddress))].sort(),
    [threads],
  );

  const labelEntries = useMemo(
    () =>
      Object.entries(labels)
        .filter(([id]) => (threads ?? []).some((t) => t.labelIds.includes(id)))
        .sort((a, b) => a[1].localeCompare(b[1])),
    [labels, threads],
  );

  const visible = useMemo(() => {
    const all = threads ?? [];
    if (selection.kind === "label") {
      return all.filter((t) => t.labelIds.includes(selection.id));
    }
    if (selection.kind === "mailbox") {
      return all.filter((t) => t.mailboxAddress === selection.id);
    }
    return all;
  }, [threads, selection]);

  const unreadCount = (threads ?? []).filter((t) => t.unread).length;

  // Reading replaces the list, as Gmail does — a side panel wastes a wide screen.
  if (openSummary) {
    return (
      <ThreadReader
        summary={openSummary}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onBack={onCloseThread}
      />
    );
  }

  return (
    <div className="flex gap-4">
      {/* Rail. Hidden on small screens, where the list itself needs the width. */}
      <nav className="hidden w-44 shrink-0 md:block">
        <ul className="space-y-0.5">
          <RailItem
            active={selection.kind === "all"}
            onClick={() => setSelection({ kind: "all" })}
            icon={<Inbox className="size-3.5" />}
            count={threads?.length}
            badge={unreadCount || undefined}
          >
            All mail
          </RailItem>

          {labelEntries.length > 0 && (
            <li className="text-muted-foreground px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
              Labels
            </li>
          )}
          {labelEntries.map(([id, name]) => (
            <RailItem
              key={id}
              active={selection.kind === "label" && selection.id === id}
              onClick={() => setSelection({ kind: "label", id })}
              icon={<Tag className="size-3.5" />}
              count={(threads ?? []).filter((t) => t.labelIds.includes(id)).length}
            >
              {name}
            </RailItem>
          ))}

          {/* Only meaningful once more than one account contributes mail. */}
          {mailboxes.length > 1 && (
            <>
              <li className="text-muted-foreground px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
                Accounts
              </li>
              {mailboxes.map((address) => (
                <RailItem
                  key={address}
                  active={selection.kind === "mailbox" && selection.id === address}
                  onClick={() => setSelection({ kind: "mailbox", id: address })}
                  icon={<Mail className="size-3.5" />}
                  count={
                    (threads ?? []).filter((t) => t.mailboxAddress === address).length
                  }
                  title={address}
                >
                  {address.split("@")[0]}
                </RailItem>
              ))}
            </>
          )}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground truncate text-sm">
            {threads === null
              ? "Loading conversations…"
              : `${visible.length} conversation${visible.length === 1 ? "" : "s"}${
                  unreadCount ? ` · ${unreadCount} unread` : ""
                }`}
          </p>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {threads === null ? (
          <div className="divide-y overflow-hidden rounded-xl border">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-3.5 w-32 shrink-0" />
                <Skeleton className="h-3.5 min-w-0 flex-1" />
                <Skeleton className="h-3 w-10 shrink-0" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState filtered={(threads?.length ?? 0) > 0} />
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {visible.map((thread) => (
              <ThreadRow
                key={`${thread.mailboxId}:${thread.threadId}`}
                thread={thread}
                showMailbox={mailboxes.length > 1 && selection.kind !== "mailbox"}
                onOpen={() => onOpenThread(thread)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RailItem({
  active,
  onClick,
  icon,
  count,
  badge,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count?: number;
  badge?: number;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        title={title}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
          active
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {badge ? (
          <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums">
            {badge}
          </span>
        ) : (
          count !== undefined && (
            <span className="shrink-0 text-[11px] tabular-nums opacity-60">{count}</span>
          )
        )}
      </button>
    </li>
  );
}

/**
 * One thread, one line — sender, subject, snippet, date.
 *
 * The stacked three-line version fitted ~10 threads on a 1080p screen; this fits
 * roughly 25, which is what makes it read as a mailbox.
 */
function ThreadRow({
  thread,
  showMailbox,
  onOpen,
}: {
  thread: ThreadSummary;
  showMailbox: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        "group hover:bg-muted/50 focus-visible:ring-ring/50 relative flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none",
        thread.unread && "bg-primary/[0.03]",
      )}
    >
      {/* Unread accent, the quietest possible version of Gmail's bold row. */}
      {thread.unread && (
        <span aria-hidden className="bg-primary absolute inset-y-0 left-0 w-0.5" />
      )}

      <Avatar label={thread.counterpartyName || thread.counterparty} />

      {thread.starred ? (
        <Star
          aria-label="Starred in Gmail"
          className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
        />
      ) : (
        <span aria-hidden className="w-3.5 shrink-0" />
      )}

      <span
        className={cn(
          "w-40 shrink-0 truncate text-sm",
          thread.unread ? "font-semibold" : "font-medium",
        )}
        title={thread.counterparty}
      >
        {thread.counterpartyName || thread.counterparty}
      </span>

      {thread.messageCount > 1 && (
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
          {thread.messageCount}
        </span>
      )}

      {/* Subject and snippet share one line: the snippet is what gets truncated. */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {thread.lastFromMe && (
          <CornerUpLeft
            aria-label="You sent the last message"
            className="text-muted-foreground size-3 shrink-0"
          />
        )}
        <span className={cn("shrink-0 truncate text-sm", thread.unread && "font-semibold")}>
          {thread.subject}
        </span>
        {thread.snippet && (
          <span className="text-muted-foreground min-w-0 truncate text-sm">
            — {thread.snippet}
          </span>
        )}
      </span>

      {thread.hasAttachment && (
        <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
      )}

      {showMailbox && (
        <Badge
          variant="secondary"
          className="hidden shrink-0 px-1.5 py-0 text-[10px] font-normal lg:inline-flex"
        >
          {thread.mailboxAddress.split("@")[0]}
        </Badge>
      )}

      <time
        className={cn(
          "w-14 shrink-0 text-right text-xs tabular-nums",
          thread.unread ? "font-semibold" : "text-muted-foreground",
        )}
        title={thread.lastMessageAt ? formatMailDateFull(thread.lastMessageAt) : undefined}
      >
        {thread.lastMessageAt ? formatMailDate(thread.lastMessageAt) : "—"}
      </time>
    </button>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="bg-muted mx-auto grid size-10 place-content-center rounded-full">
        {filtered ? (
          <Inbox className="text-muted-foreground size-5" />
        ) : (
          <Mail className="text-muted-foreground size-5" />
        )}
      </span>
      <p className="mt-3 text-sm font-medium">
        {filtered ? "Nothing here" : "No mail in scope yet"}
      </p>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs leading-relaxed">
        {filtered
          ? "Pick All mail to see conversations from your other labels and accounts."
          : "Open Mailboxes, pick a Gmail label, then apply that label to a conversation in Gmail. Only labelled mail is ever read."}
      </p>
    </div>
  );
}

function ThreadReader({
  summary,
  detail,
  loading,
  error,
  onBack,
}: {
  summary: ThreadSummary;
  detail: ThreadDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to mail" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <p className="text-muted-foreground truncate text-xs">
          via {summary.mailboxAddress}
          {summary.lastMessageAt && ` · ${formatRelative(summary.lastMessageAt)}`}
        </p>
      </div>

      <div>
        <h2 className="text-xl leading-tight font-semibold">
          {detail?.subject ?? summary.subject}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {summary.counterpartyName}
          {summary.counterparty !== summary.counterpartyName && (
            <span className="opacity-70"> · {summary.counterparty}</span>
          )}
        </p>
      </div>

      {error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </div>
      )}

      {loading && !detail && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      )}

      <div className="space-y-3">
        {detail?.messages.map((message, index) => (
          <MessageCard
            key={message.id || index}
            message={message}
            defaultOpen={index === detail.messages.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

/** Newest expanded, older collapsed — a long thread is otherwise a wall of quotes. */
function MessageCard({
  message,
  defaultOpen,
}: {
  message: ThreadMessage;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const outbound = message.direction === "outbound";

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-muted/50 flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
      >
        <Avatar label={message.fromName || message.from} size="sm" />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {message.fromName}
            <span className="text-muted-foreground font-normal"> · {message.from}</span>
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            to {message.to || "—"}
          </span>
        </span>

        {message.hasAttachment && (
          <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
        )}

        <Badge
          variant="outline"
          className={cn(
            "shrink-0 font-medium",
            outbound
              ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-200"
              : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
          )}
        >
          {outbound ? "Sent" : "Received"}
        </Badge>

        <time
          className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums"
          title={message.sentAt ? formatMailDateFull(message.sentAt) : undefined}
        >
          {message.sentAt ? formatMailDate(message.sentAt) : "—"}
        </time>
      </button>

      {open && (
        <div className="border-t">
          <MailMessageBody
            html={message.bodyHtml}
            quotedHtml={message.quotedHtml}
            hasBlockedImages={message.hasBlockedImages}
          />
        </div>
      )}
    </div>
  );
}
