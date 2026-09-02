// ============================================================
//  LEADS JSON API — companion file for Code.gs
//
//  Exposes the Leads sheet to the Next.js dashboard over HTTP.
//  Paste this as a SECOND file in the same Apps Script project
//  (Files > + > Script, name it "Api"). It shares globals with
//  Code.gs, so CONFIG is already available here.
//
//  ── SETUP (once) ────────────────────────────────────────────
//   1. Run  setupApi()  from the Run dropdown. It generates a
//      shared secret and prints it in the execution log
//      (View > Logs). Copy it.
//   2. Deploy > New deployment > type: Web app
//        Execute as:      Me
//        Who has access:  Anyone
//      "Anyone" is safe here because every request must carry the
//      token from step 1 — without it the API returns 401.
//   3. Copy the /exec URL. Put both into the dashboard's
//      .env.local:
//        SHEETS_API_URL=https://script.google.com/macros/s/.../exec
//        SHEETS_API_TOKEN=<the token from step 1>
//
//  IMPORTANT: after editing this file you must redeploy
//  (Deploy > Manage deployments > edit > Version: New version),
//  otherwise the live /exec URL keeps serving the old code.
//
//  ── ENDPOINTS ───────────────────────────────────────────────
//   GET  ?token=X&action=leads    → { ok, leads: [...], meta }
//   GET  ?token=X&action=ping     → { ok, sheet, rows }
//   POST { token, action: "update",     row, key, updates }
//   POST { token, action: "bulkUpdate", items: [{row,key,updates}] }
//
//  Every endpoint takes an optional `tab` (query param on GET, body
//  field on POST) naming the tab to read/write. Leave it off and the
//  live Leads tab from CONFIG is used, exactly as before. Set it to
//  point the dashboard at a scratch copy while Code.gs keeps filling
//  the real tab. Reads and writes both honour it, so an edit made in
//  the dashboard lands on the tab it was displaying.
// ============================================================


// ─── COLUMN MAP ──────────────────────────────────────────────
// 0-based indexes into LEAD_HEADERS (Code.gs). Keep in sync if
// you ever reorder columns — migrateSheet() rewrites headers but
// not this map.
const API_FIELDS = {
  dateFound:      0,   // A
  priority:       1,   // B
  score:          2,   // C
  company:        3,   // D
  contactName:    4,   // E
  titleRole:      5,   // F
  email:          6,   // G
  signalSource:   7,   // H
  matchedSignals: 8,   // I
  headline:       9,   // J
  snippet:       10,   // K
  sourceUrl:     11,   // L
  status:        12,   // M
  notes:         13,   // N
  outreachSent:  14,   // O
  segment:       15,   // P
  intent:        16,   // Q
  domain:        17    // R
};

// Only these may be written by the dashboard. Everything else is
// produced by the scraper and is read-only — a dashboard bug can't
// corrupt Score, Headline or Source URL.
const API_EDITABLE = ["contactName", "titleRole", "email",
                      "status", "notes", "outreachSent"];

const API_COL_COUNT = 18;
const API_TOKEN_PROP = "DASHBOARD_API_TOKEN";


// ─── SETUP ───────────────────────────────────────────────────

/**
 * Generates (or re-shows) the shared secret the dashboard must send.
 * Run this once, then copy the token out of View > Logs.
 */
function setupApi() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty(API_TOKEN_PROP);

  if (!token) {
    token = Utilities.getUuid().replace(/-/g, "") +
            Utilities.getUuid().replace(/-/g, "").substring(0, 16);
    props.setProperty(API_TOKEN_PROP, token);
    Logger.log("Generated a NEW API token.");
  } else {
    Logger.log("An API token already exists (re-showing it).");
  }

  Logger.log("");
  Logger.log("SHEETS_API_TOKEN=" + token);
  Logger.log("");
  Logger.log("Next: Deploy > New deployment > Web app");
  Logger.log("  Execute as: Me   |   Who has access: Anyone");
  Logger.log("Then put the /exec URL in SHEETS_API_URL.");

  safeAlert_("API token written to the log.\n\n" +
             "View > Logs (or Executions) to copy it.");
  return token;
}

/** Invalidates the current token and issues a new one. */
function rotateApiToken() {
  PropertiesService.getScriptProperties().deleteProperty(API_TOKEN_PROP);
  return setupApi();
}


// ─── HTTP ENTRY POINTS ───────────────────────────────────────

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    apiAuth_(params.token);

    switch (params.action || "leads") {
      case "ping":  return apiJson_(apiPing_(params));
      case "leads": return apiJson_(apiLeads_(params));
      default:
        throw apiError_(400, "Unknown action: " + params.action);
    }
  } catch (err) {
    return apiJson_(apiFailure_(err));
  }
}

function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        throw apiError_(400, "Request body is not valid JSON.");
      }
    }
    // Allow the token in the query string too, so the body stays pure data.
    apiAuth_(body.token || (e && e.parameter && e.parameter.token));

    switch (body.action) {
      case "update":
        return apiJson_(apiUpdate_([{
          row: body.row, key: body.key, updates: body.updates
        }], body.tab));
      case "bulkUpdate":
        return apiJson_(apiUpdate_(body.items || [], body.tab));
      default:
        throw apiError_(400, "Unknown action: " + body.action);
    }
  } catch (err) {
    return apiJson_(apiFailure_(err));
  }
}


// ─── ACTIONS ─────────────────────────────────────────────────

function apiPing_(params) {
  const sheet = apiLeadsSheet_(params && params.tab);
  return {
    ok: true,
    sheet: sheet.getName(),
    rows: Math.max(0, sheet.getLastRow() - 1),
    serverTime: new Date().toISOString()
  };
}

/**
 * Reads the whole Leads tab in one getValues() call.
 *
 * Optional params:
 *   limit  / offset  — window into the rows (newest first)
 *   status           — comma-separated Status values to keep
 *   segment          — comma-separated Segment values to keep
 *
 * Filtering is done here as a convenience, but the dashboard pulls
 * everything and filters client-side — a few thousand rows is well
 * under the payload limit and makes the UI instant.
 */
function apiLeads_(params) {
  const sheet   = apiLeadsSheet_(params.tab);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return { ok: true, leads: [], meta: apiMeta_(0, 0) };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, API_COL_COUNT).getValues();

  let leads = values.map(function (row, i) {
    return apiToLead_(row, i + 2);   // +2: 1-based sheet rows, skip header
  });

  // Newest first — the sheet appends, so the tail is the freshest.
  leads.reverse();

  const total = leads.length;

  const statusFilter  = apiCsvSet_(params.status);
  const segmentFilter = apiCsvSet_(params.segment);
  if (statusFilter) {
    leads = leads.filter(function (l) {
      return statusFilter[String(l.status).toLowerCase()];
    });
  }
  if (segmentFilter) {
    leads = leads.filter(function (l) {
      return segmentFilter[String(l.segment).toLowerCase()];
    });
  }

  const offset = Math.max(0, parseInt(params.offset, 10) || 0);
  const limit  = parseInt(params.limit, 10);
  if (limit > 0) leads = leads.slice(offset, offset + limit);
  else if (offset)  leads = leads.slice(offset);

  return { ok: true, leads: leads, meta: apiMeta_(total, leads.length) };
}

/**
 * Applies partial updates to one or more rows.
 *
 * Each item is { row, key, updates }. `row` is the sheet row number the
 * dashboard last saw the lead at; `key` is its content fingerprint. If the
 * fingerprint at `row` no longer matches — because rows were sorted, inserted
 * or deleted in the Sheet directly — we search the sheet for the key rather
 * than blindly overwriting whatever now sits at that row. That is the whole
 * reason `key` exists: without it a sort in the Sheet would silently write a
 * "Contacted" status onto an unrelated lead.
 */
function apiUpdate_(items, tabName) {
  if (!items.length) throw apiError_(400, "No items to update.");

  // Must resolve to the same tab the read came from, or the dashboard would
  // show the scratch copy while writing edits onto the live leads.
  const sheet   = apiLeadsSheet_(tabName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw apiError_(404, "The Leads sheet has no rows yet.");

  const all     = sheet.getRange(2, 1, lastRow - 1, API_COL_COUNT).getValues();
  const results = [];
  const touched = {};

  items.forEach(function (item) {
    const key     = String(item.key || "");
    const updates = item.updates || {};

    const fields = Object.keys(updates).filter(function (f) {
      return API_EDITABLE.indexOf(f) !== -1;
    });
    if (!fields.length) {
      results.push({ key: key, ok: false,
                     error: "No editable fields in this update." });
      return;
    }

    const index = apiLocateRow_(all, item.row, key);
    if (index === -1) {
      results.push({ key: key, ok: false,
                     error: "Lead not found — it may have been deleted from the sheet." });
      return;
    }

    fields.forEach(function (f) {
      const value = updates[f];
      all[index][API_FIELDS[f]] = (value === null || value === undefined) ? "" : value;
    });

    touched[index] = true;
    results.push({ key: key, ok: true, row: index + 2,
                   lead: apiToLead_(all[index], index + 2) });
  });

  // Write only the rows that actually changed, one setValues() per row.
  // Rewriting the whole range would clobber any edit made in the Sheet
  // between our read above and this write.
  Object.keys(touched).forEach(function (index) {
    const i = parseInt(index, 10);
    sheet.getRange(i + 2, 1, 1, API_COL_COUNT).setValues([all[i]]);
  });

  SpreadsheetApp.flush();

  const failed = results.filter(function (r) { return !r.ok; });
  return { ok: failed.length === 0, results: results,
           updated: results.length - failed.length, failed: failed.length };
}


// ─── ROW <-> JSON ────────────────────────────────────────────

function apiToLead_(row, sheetRow) {
  const lead = { row: sheetRow };

  Object.keys(API_FIELDS).forEach(function (field) {
    lead[field] = apiCell_(row[API_FIELDS[field]]);
  });

  lead.score = Number(lead.score) || 0;
  lead.key   = apiKey_(row);
  return lead;
}

function apiCell_(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value).trim();
}

/**
 * Content fingerprint used to re-find a row after the sheet is reordered.
 * Source URL is unique per lead in practice; company+headline is the fallback
 * for the rare row saved without one.
 */
function apiKey_(row) {
  const url = String(row[API_FIELDS.sourceUrl] || "").trim();
  if (url) return url.toLowerCase();

  return (String(row[API_FIELDS.company] || "") + "|" +
          String(row[API_FIELDS.headline] || ""))
         .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Fast path: trust `row` if the key still matches. Otherwise scan. */
function apiLocateRow_(all, sheetRow, key) {
  const hinted = parseInt(sheetRow, 10) - 2;
  if (hinted >= 0 && hinted < all.length && apiKey_(all[hinted]) === key) {
    return hinted;
  }
  for (let i = 0; i < all.length; i++) {
    if (apiKey_(all[i]) === key) return i;
  }
  return -1;
}


// ─── PLUMBING ────────────────────────────────────────────────

/**
 * `tabName` lets the caller aim at a tab other than the live one. That is how
 * the dashboard can render a scratch copy ("Copy of Leads") during development
 * while Code.gs keeps appending real leads to the tab it always has. Omit it
 * and nothing changes — CONFIG still decides.
 */
function apiLeadsSheet_(tabName) {
  const requested = tabName ? String(tabName).trim() : "";
  const name  = requested ||
                (CONFIG && CONFIG.SHEETS && CONFIG.SHEETS.LEADS) || "Leads";
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw apiError_(404, 'No "' + name + '" tab in this spreadsheet. ' +
                         "Run setupSheet() or migrateSheet() first.");
  }
  return sheet;
}

function apiAuth_(token) {
  const expected = PropertiesService.getScriptProperties()
                     .getProperty(API_TOKEN_PROP);
  if (!expected) {
    throw apiError_(500, "No API token configured. Run setupApi() in the " +
                         "Apps Script editor first.");
  }
  if (!token || String(token) !== expected) {
    throw apiError_(401, "Invalid or missing token.");
  }
}

function apiMeta_(total, returned) {
  return {
    total: total,
    returned: returned,
    headers: (typeof LEAD_HEADERS !== "undefined") ? LEAD_HEADERS : [],
    editable: API_EDITABLE,
    fetchedAt: new Date().toISOString()
  };
}

function apiCsvSet_(csv) {
  if (!csv) return null;
  const set = {};
  String(csv).split(",").forEach(function (v) {
    const t = v.trim().toLowerCase();
    if (t) set[t] = true;
  });
  return Object.keys(set).length ? set : null;
}

function apiError_(status, message) {
  const err = new Error(message);
  err.apiStatus = status;
  return err;
}

function apiFailure_(err) {
  return {
    ok: false,
    status: err.apiStatus || 500,
    error: err.message || String(err)
  };
}

/**
 * Apps Script web apps can't set HTTP status codes or CORS headers, so every
 * response is 200 with an `ok` flag and a `status` field. The dashboard talks
 * to this from its own server, never the browser, so CORS never comes up.
 */
function apiJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
