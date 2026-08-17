"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, Loader2, Mail, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { startGoogleConnect } from "@/app/actions/mailboxes";
import { MailboxLabelPicker } from "@/components/mailbox-label-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  MAILBOX_HEALTH_LABEL,
  mailboxHealth,
  needsSyncScopeConsent,
  type GmailLabel,
  type Mailbox,
  type MailboxHealth,
} from "@/lib/google/types";

const HEALTH_STYLES: Record<MailboxHealth, string> = {
  connected:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
  connecting:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
  // Blue, not amber: awaiting a label choice is a normal next step, not a fault.
  "awaiting-scope":
    "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-200",
  issue:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200",
};

const HEALTH_DOT: Record<MailboxHealth, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500",
  "awaiting-scope": "bg-blue-500",
  issue: "bg-rose-500",
};

/**
 * Connect and manage Google accounts.
 *
 * Lives in the dashboard header rather than a settings page: attaching a mailbox
 * is a first-class action here, not a buried preference.
 *
 * `initial` comes from the server component so the header count is right on the
 * first paint — same reasoning as the leads themselves. The list is refetched
 * when the dialog opens, because a connect round-trips through Google and comes
 * back to a fresh page load.
 */
export function MailboxDialog({
  initial,
  configured,
}: {
  initial: Mailbox[];
  configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, startConnect] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Labels per mailbox, loaded lazily when a row is expanded. Undefined = never
  // requested, null = in flight.
  const [labels, setLabels] = useState<Record<string, GmailLabel[] | null>>({});

  const loadLabels = useCallback(async (mailboxId: string) => {
    setLabels((prev) => ({ ...prev, [mailboxId]: null }));
    try {
      const res = await fetch(`/api/mailboxes/${mailboxId}/labels`, {
        cache: "no-store",
      });
      const body = (await res.json()) as { labels?: GmailLabel[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setLabels((prev) => ({ ...prev, [mailboxId]: body.labels ?? [] }));
    } catch (err) {
      toast.error("Could not load Gmail labels", {
        description: err instanceof Error ? err.message : String(err),
      });
      setLabels((prev) => ({ ...prev, [mailboxId]: [] }));
    }
  }, []);

  /**
   * Fetch-once guard. A ref rather than reading `labels`, so this stays out of
   * the state updater — an updater must be pure, and StrictMode calls it twice.
   */
  const requested = useRef<Set<string>>(new Set());

  const ensureLabels = useCallback(
    (mailboxId: string) => {
      if (requested.current.has(mailboxId)) return;
      requested.current.add(mailboxId);
      void loadLabels(mailboxId);
    },
    [loadLabels],
  );

  const toggleRow = useCallback(
    (mailboxId: string) => {
      setExpandedId((current) => (current === mailboxId ? null : mailboxId));
      ensureLabels(mailboxId);
    },
    [ensureLabels],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/mailboxes", { cache: "no-store" });
      const body = (await res.json()) as { mailboxes?: Mailbox[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const next = body.mailboxes ?? [];
      setMailboxes(next);

      // A mailbox that has chosen nothing opens expanded, so a gated account
      // never just sits there looking broken while the user hunts for a setting.
      const gated = next.find(needsSyncScopeConsent);
      if (gated) {
        setExpandedId(gated.id);
        ensureLabels(gated.id);
      }
    } catch (err) {
      toast.error("Could not load mailboxes", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshing(false);
    }
  }, [ensureLabels]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      setConfirmingId(null);
      if (next) void refresh();
    },
    [refresh],
  );

  const connect = useCallback(() => {
    startConnect(async () => {
      const result = await startGoogleConnect();

      if ("error" in result) {
        toast.error("Cannot connect Gmail", { description: result.error });
        return;
      }

      // Full-page navigation. A popup or fetch cannot carry an OAuth redirect.
      window.location.href = result.url;
    });
  }, []);

  const disconnect = useCallback(async (mailbox: Mailbox) => {
    setPendingId(mailbox.id);
    try {
      const res = await fetch("/api/mailboxes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mailbox.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      setMailboxes((prev) => prev.filter((m) => m.id !== mailbox.id));
      toast.success(`Disconnected ${mailbox.address}`);
    } catch (err) {
      toast.error("Could not disconnect", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPendingId(null);
      setConfirmingId(null);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Mail className="size-4" />
        Mailboxes
        {mailboxes.length > 0 && (
          <span className="text-muted-foreground tabular-nums">
            {mailboxes.length}
          </span>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connected Gmail accounts</DialogTitle>
          <DialogDescription>
            Connect as many accounts as you like. Each one is read with its own
            Google grant, and the tokens never leave the server.
          </DialogDescription>
        </DialogHeader>

        {!configured && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <p className="leading-relaxed">
              Gmail is not configured yet. Set{" "}
              <code className="bg-muted rounded px-1">GOOGLE_CLIENT_ID</code>,{" "}
              <code className="bg-muted rounded px-1">GOOGLE_CLIENT_SECRET</code>,{" "}
              <code className="bg-muted rounded px-1">GOOGLE_GMAIL_REDIRECT_URI</code>{" "}
              and the Supabase keys in{" "}
              <code className="bg-muted rounded px-1">.env.local</code>, then
              restart the dev server. See{" "}
              <code className="bg-muted rounded px-1">docs/GMAIL-SYNC.md</code>.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {mailboxes.length === 0 && (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs">
              {refreshing ? "Loading…" : "No accounts connected yet."}
            </p>
          )}

          {mailboxes.map((mailbox) => {
            const health = mailboxHealth(mailbox);
            const pending = pendingId === mailbox.id;

            return (
              <div
                key={mailbox.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border p-2.5 transition-opacity",
                  pending && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{mailbox.address}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {mailbox.connectedAt
                      ? `connected ${formatRelative(mailbox.connectedAt)}`
                      : "not finished connecting"}
                  </p>
                </div>

                <Badge
                  variant="outline"
                  className={cn("gap-1.5 font-medium", HEALTH_STYLES[health])}
                >
                  <span
                    className={cn("size-1.5 rounded-full", HEALTH_DOT[health])}
                  />
                  {MAILBOX_HEALTH_LABEL[health]}
                </Badge>

                {/* Inline confirm rather than a nested dialog — disconnecting is
                    reversible (the row is kept and revived on reconnect), so a
                    modal on top of a modal would be heavier than the action. */}
                {confirmingId === mailbox.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => void disconnect(mailbox)}
                    >
                      {pending && <Loader2 className="size-3.5 animate-spin" />}
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingId(mailbox.id)}
                  >
                    Disconnect
                  </Button>
                )}

                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Labels for ${mailbox.address}`}
                  onClick={() => toggleRow(mailbox.id)}
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      expandedId === mailbox.id && "rotate-180",
                    )}
                  />
                </Button>

                {mailbox.syncError && (
                  <p className="text-destructive w-full text-xs leading-relaxed">
                    {mailbox.syncError}
                  </p>
                )}

                {expandedId === mailbox.id && (
                  <MailboxLabelPicker
                    mailbox={mailbox}
                    labels={labels[mailbox.id] ?? null}
                    onCreated={(label) =>
                      setLabels((prev) => ({
                        ...prev,
                        [mailbox.id]: [label, ...(prev[mailbox.id] ?? [])],
                      }))
                    }
                    onSaved={(updated) =>
                      setMailboxes((prev) =>
                        prev.map((m) => (m.id === updated.id ? updated : m)),
                      )
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>

          {/* Stays enabled with accounts already present — that is the
              multi-account path, not an edge case. */}
          <Button onClick={connect} disabled={connecting || !configured}>
            {connecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Connect Gmail account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
