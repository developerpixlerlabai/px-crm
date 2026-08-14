"use client";

import { useMemo } from "react";
import { Flame, Inbox, CalendarCheck, Send } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CLOSED_STATUSES, priorityOf, type Lead } from "@/lib/types";

type Stat = {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

export function StatCards({ leads }: { leads: Lead[] }) {
  const stats = useMemo<Stat[]>(() => {
    const open = leads.filter((l) => !CLOSED_STATUSES.includes(l.status));
    const hot = open.filter((l) => priorityOf(l) === "hot");
    const untouched = leads.filter((l) => !l.status || l.status === "New");
    const contacted = leads.filter((l) =>
      ["Outreach Sent", "Replied", "Meeting Booked"].includes(l.status),
    );
    const replied = leads.filter((l) =>
      ["Replied", "Meeting Booked"].includes(l.status),
    );
    const meetings = leads.filter((l) => l.status === "Meeting Booked");

    const replyRate = contacted.length
      ? Math.round((replied.length / contacted.length) * 100)
      : 0;

    return [
      {
        label: "Open leads",
        value: open.length,
        hint: `${leads.length} total scraped`,
        icon: Inbox,
        accent: "text-slate-500",
      },
      {
        label: "Hot & open",
        value: hot.length,
        hint: "score 8 or above",
        icon: Flame,
        accent: "text-orange-500",
      },
      {
        label: "Needs triage",
        value: untouched.length,
        hint: 'still marked "New"',
        icon: Send,
        accent: "text-amber-500",
      },
      {
        label: "Meetings booked",
        value: meetings.length,
        hint: contacted.length
          ? `${replyRate}% reply rate on ${contacted.length} contacted`
          : "no outreach sent yet",
        icon: CalendarCheck,
        accent: "text-emerald-500",
      },
    ];
  }, [leads]);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="gap-0 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {stat.label}
            </span>
            <stat.icon className={cn("size-4 shrink-0", stat.accent)} />
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {stat.value}
          </div>
          <p className="text-muted-foreground mt-1 truncate text-xs">{stat.hint}</p>
        </Card>
      ))}
    </div>
  );
}
