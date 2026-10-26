import { connection } from "next/server";

import { Dashboard } from "@/components/dashboard";
import { SetupNotice } from "@/components/setup-notice";
import { listMailboxes } from "@/lib/google/mailboxes";
import { isGoogleConfigured } from "@/lib/google/oauth";
import { LeadsError, fetchLeads } from "@/lib/leads";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import type { Mailbox } from "@/lib/google/types";
import type { LeadsResponse } from "@/lib/types";

/**
 * Server component: the first paint already has the leads in it, so there is no
 * client-side loading flash. Everything interactive lives in <Dashboard />.
 */
export default async function Page() {
  // Leads change on every scrape and every edit, and the env check below must
  // run against the deployed env, not the build's. Never prerender this page.
  await connection();

  if (!isSupabaseConfigured()) return <SetupNotice />;

  // Independent reads, so neither waits on the other.
  const mailboxes = loadMailboxes();

  let data: LeadsResponse;
  try {
    data = await fetchLeads();
  } catch (err) {
    console.error("[page] could not load leads", err);
    return (
      <SetupNotice
        error={err instanceof LeadsError ? err.message : "Could not reach Supabase."}
      />
    );
  }

  return (
    <Dashboard
      initial={data}
      mailboxes={await mailboxes}
      gmailConfigured={isGoogleConfigured()}
    />
  );
}

/**
 * Mailboxes are a secondary concern on this page: a failure loading them must
 * not take the leads dashboard down with it.
 */
async function loadMailboxes(): Promise<Mailbox[]> {
  try {
    return await listMailboxes();
  } catch (err) {
    console.error("[page] could not load mailboxes", err);
    return [];
  }
}
