import { describe, expect, it } from "vitest";
import {
  parsePlayerRecord,
  flightCodeFromTeamName,
  flightKeyOf,
} from "./parsePlayerRecord.js";

// Mirrors the real t=T-0 player-record DOM: per-year blocks, each a table
// whose data rows lead with a __doPostBack team anchor (id contains
// "rptPlayerName" and ends "LinkButton4"), followed by Section / District /
// League / Flight cells.
const FIXTURE = `
<div id="ctl00_mainContent_hResultTitle">JOHN DOE</div>
<table>
  <thead><tr><th><a id="ctl00_mainContent_rptTeamsListForSearchPlayersByNum_ctl00_LinkButton22"
     href="javascript:__doPostBack('x','')">2026 Individual Player Record</a></th></tr></thead>
  <tbody>
    <tr><td class="subhead">Team</td><td class="subhead">Section</td><td class="subhead">District</td><td class="subhead">League</td><td class="subhead">Flight</td></tr>
    <tr>
      <td class="top"><a id="ctl00_mainContent_rptTeamsListForSearchPlayersByNum_ctl00_rptPlayerName_ctl00_LinkButton4"
        href="javascript:__doPostBack('ctl00$mainContent$rptTeamsListForSearchPlayersByNum$ctl00$rptPlayerName$ctl00$LinkButton4','')">OAKLAND HILLS 40AM3.5A</a></td>
      <td class="top">USTA/NO. CALIFORNIA</td>
      <td class="top">NO. CALIFORNIA</td>
      <td class="top">2026 ADULT 40&amp;Over</td>
      <td class="top">Men's 3.5</td>
    </tr>
  </tbody>
</table>
<table>
  <thead><tr><th><a id="ctl00_mainContent_rptTeamsListForSearchPlayersByNum_ctl01_LinkButton22"
     href="javascript:__doPostBack('y','')">2025 Individual Player Record</a></th></tr></thead>
  <tbody>
    <tr><td class="subhead">Team</td><td class="subhead">Section</td><td class="subhead">District</td><td class="subhead">League</td><td class="subhead">Flight</td></tr>
    <tr>
      <td class="top"><a id="ctl00_mainContent_rptTeamsListForSearchPlayersByNum_ctl01_rptPlayerName_ctl00_LinkButton4"
        href="javascript:__doPostBack('z','')">WALNUT CREEK RC/Walnut Creek TC 18AM3.0B</a></td>
      <td class="top">USTA/NO. CALIFORNIA</td>
      <td class="top">NO. CALIFORNIA</td>
      <td class="top">2025 ADULT 18&amp;Over</td>
      <td class="top">Men's 3.0</td>
    </tr>
    <tr>
      <td class="top"><a id="ctl00_mainContent_rptTeamsListForSearchPlayersByNum_ctl01_rptPlayerName_ctl01_LinkButton4"
        href="javascript:__doPostBack('w','')">OAKLAND HILLS 18MX7.0A</a></td>
      <td class="top">USTA/NO. CALIFORNIA</td>
      <td class="top">NO. CALIFORNIA</td>
      <td class="top">2025 MIXED 18&amp;Over</td>
      <td class="top">Mixed 7.0</td>
    </tr>
  </tbody>
</table>`;

describe("parsePlayerRecord", () => {
  const parsed = parsePlayerRecord(FIXTURE);

  it("reads the player name", () => {
    expect(parsed.playerName).toBe("JOHN DOE");
  });

  it("extracts every team row across year blocks", () => {
    expect(parsed.teams).toHaveLength(3);
  });

  it("captures the team anchor id, league, flight, and year", () => {
    const t = parsed.teams[0]!;
    expect(t.teamName).toBe("OAKLAND HILLS 40AM3.5A");
    expect(t.teamAnchorId).toBe(
      "ctl00_mainContent_rptTeamsListForSearchPlayersByNum_ctl00_rptPlayerName_ctl00_LinkButton4"
    );
    expect(t.league).toBe("2026 ADULT 40&Over");
    expect(t.flight).toBe("Men's 3.5");
    expect(t.year).toBe(2026);
    expect(t.section).toBe("USTA/NO. CALIFORNIA");
  });

  it("derives year from the league prefix for older blocks", () => {
    const mixed = parsed.teams.find((t) => t.flight === "Mixed 7.0")!;
    expect(mixed.year).toBe(2025);
    expect(mixed.league).toBe("2025 MIXED 18&Over");
  });

  it("ignores the per-year 'Individual Player Record' header anchors", () => {
    // Only LinkButton4 anchors are teams; LinkButton22 headers are excluded.
    expect(parsed.teams.every((t) => /LinkButton4$/.test(t.teamAnchorId))).toBe(
      true
    );
  });
});

describe("flightCodeFromTeamName", () => {
  it("strips the trailing cluster letter", () => {
    expect(flightCodeFromTeamName("OAKLAND HILLS 40AM3.5A")).toBe("40AM3.5");
    expect(flightCodeFromTeamName("WALNUT CREEK RC/Walnut Creek TC 18AM3.0B")).toBe(
      "18AM3.0"
    );
    expect(flightCodeFromTeamName("OAKLAND HILLS 18MX7.0A")).toBe("18MX7.0");
  });

  it("returns undefined when no code is present", () => {
    expect(flightCodeFromTeamName("Some Random Team")).toBeUndefined();
  });
});

describe("flightKeyOf", () => {
  it("builds a stable key", () => {
    expect(flightKeyOf(2026, "2026 ADULT 40&Over", "Men's 3.5")).toBe(
      "2026|2026 ADULT 40&Over|Men's 3.5"
    );
  });
});
