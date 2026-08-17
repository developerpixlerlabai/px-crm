import { Dashboard } from "@/components/dashboard";
import { SetupNotice } from "@/components/setup-notice";
import { listMailboxes } from "@/lib/google/mailboxes";
import { isGoogleConfigured } from "@/lib/google/oauth";
import { SheetsError, fetchLeads, isConfigured } from "@/lib/sheets";
import { isSupabaseConfigured } from "@/lib/supabase/service";
import type { Mailbox } from "@/lib/google/types";
import type { LeadsResponse } from "@/lib/types";

/**
 * Server component: the first paint already has the leads in it, so there is no
 * client-side loading flash. Everything interactive lives in <Dashboard />.
 */
export default async function Page() {
  if (!isConfigured()) return <SetupNotice />;

  let data: LeadsResponse;
  try {
    data = await fetchLeads();
  } catch (err) {
    return (
      <SetupNotice
        error={
          err instanceof SheetsError
            ? err.message
            : "Could not reach the Apps Script API."
        }
      />
    );
  }

  return (
    <Dashboard
      initial={data}
      mailboxes={await loadMailboxes()}
      gmailConfigured={isGoogleConfigured() && isSupabaseConfigured()}
    />
  );
}

/**
 * Mailboxes are a secondary concern on this page: a Supabase outage, or simply
 * not having configured it yet, must not take the leads dashboard down with it.
 */
async function loadMailboxes(): Promise<Mailbox[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    return await listMailboxes();
  } catch (err) {
    console.error("[page] could not load mailboxes", err);
    return [];
  }
}
