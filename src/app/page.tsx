import { Dashboard } from "@/components/dashboard";
import { SetupNotice } from "@/components/setup-notice";
import { SheetsError, fetchLeads, isConfigured } from "@/lib/sheets";
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

  return <Dashboard initial={data} />;
}
