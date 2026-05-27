// Extract ASP.NET WebForms hidden state from a rendered page.
//
// USTA's TennisLink runs on classic WebForms — every interactive link
// (player name in a roster, opponent team in standings, "View Score" on
// a match) is a __doPostBack call. To "follow" one server-side we POST
// back to the same URL with the form's hidden state plus an
// __EVENTTARGET that names the control we want to click.
//
// The hidden fields we need are:
//   - __VIEWSTATE          required, the form's serialized state
//   - __VIEWSTATEGENERATOR usually a 6-8 hex-char value derived from the page id
//   - __EVENTVALIDATION    anti-tampering check on which controls can fire
//   - __EVENTTARGET        names the postback origin (we set this ourselves)
//   - __EVENTARGUMENT      mostly empty
//
// Some pages add more fields (e.g. __PREVIOUSPAGE, custom hidden inputs);
// we capture every <input type="hidden"> just in case and let the caller
// override __EVENTTARGET/__EVENTARGUMENT.

import * as cheerio from "cheerio";

export interface AspNetState {
  // Required for any valid postback.
  viewState: string;
  // Sometimes absent on older pages; pass undefined if missing.
  viewStateGenerator: string | undefined;
  eventValidation: string | undefined;
  // All other hidden inputs (name -> value), excluding the three above.
  // Caller usually doesn't need these but they get included in the POST.
  otherHidden: Record<string, string>;
}

export function extractAspNetState(html: string): AspNetState {
  const $ = cheerio.load(html);
  const $form = $("form#aspnetForm, form").first();
  const hidden: Record<string, string> = {};
  $form.find("input[type='hidden']").each((_, el) => {
    const name = $(el).attr("name");
    if (!name) return;
    const value = $(el).attr("value") ?? "";
    hidden[name] = value;
  });
  const viewState = hidden["__VIEWSTATE"];
  if (!viewState) {
    throw new Error(
      "Page has no __VIEWSTATE field — not an ASP.NET WebForms page, " +
        "or the request landed on a different URL than expected."
    );
  }
  const viewStateGenerator = hidden["__VIEWSTATEGENERATOR"];
  const eventValidation = hidden["__EVENTVALIDATION"];
  // Strip the three known fields from "other" so the POST builder doesn't
  // double-add them.
  const otherHidden: Record<string, string> = { ...hidden };
  delete otherHidden["__VIEWSTATE"];
  delete otherHidden["__VIEWSTATEGENERATOR"];
  delete otherHidden["__EVENTVALIDATION"];
  delete otherHidden["__EVENTTARGET"];
  delete otherHidden["__EVENTARGUMENT"];
  return { viewState, viewStateGenerator, eventValidation, otherHidden };
}

// Build the application/x-www-form-urlencoded body for a postback with the
// given event target. eventArgument is rarely needed (USTA always sends
// empty string in our captures).
export function buildPostbackBody(
  state: AspNetState,
  eventTarget: string,
  eventArgument = ""
): string {
  const params = new URLSearchParams();
  params.set("__EVENTTARGET", eventTarget);
  params.set("__EVENTARGUMENT", eventArgument);
  params.set("__VIEWSTATE", state.viewState);
  if (state.viewStateGenerator)
    params.set("__VIEWSTATEGENERATOR", state.viewStateGenerator);
  if (state.eventValidation)
    params.set("__EVENTVALIDATION", state.eventValidation);
  for (const [k, v] of Object.entries(state.otherHidden)) {
    params.set(k, v);
  }
  return params.toString();
}
