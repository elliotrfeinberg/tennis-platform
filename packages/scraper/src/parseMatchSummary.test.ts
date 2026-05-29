import { describe, expect, it } from "vitest";
import { parseMatchSummary } from "./parseMatchSummary.js";

// Mirrors the real stacked layout: ~16 sub-flight tables all sharing
// id="tblMatchSummarySearch", each match a block-row whose recursive text
// concatenates id + Date + Team + Opponent + Action (cells render with no
// separating whitespace).
const FIXTURE = `
<table id="tblMatchSummarySearch">
  <tr><td>Match ID</td><td>Schedule Date</td><td>Home Team</td></tr>
  <tr>
    <td>
      <table>
        <tr>
          <td>1011610209</td><td>Date:</td><td>12/29/2025</td>
          <td><table>
            <tr><td>Team:</td><td>WALNUT CREEK RC/Walnut Creek TC 40AW3.5C</td></tr>
            <tr><td>Opponent:</td><td>MORAGA CC 40AW3.5A</td></tr>
            <tr><td>Action:</td><td><a onclick="return ViewScore(1011610209,7,&quot;False&quot;)">View Score</a></td></tr>
          </table></td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td>
      <table><tr>
        <td>1011610210</td><td>Date:</td><td>1/5/2026</td>
        <td><table>
          <tr><td>Team:</td><td>MORAGA VALLEY 40AW3.5A</td></tr>
          <tr><td>Opponent:</td><td>WALNUT CREEK RC 40AW3.5B</td></tr>
          <tr><td>Action:</td><td><a onclick="return ViewScore(1011610210,7,&quot;False&quot;)">View Score</a></td></tr>
        </table></td>
      </tr></table>
    </td>
  </tr>
</table>`;

describe("parseMatchSummary", () => {
  it("extracts match id, date, and both team names per match", () => {
    const { rows } = parseMatchSummary(FIXTURE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      matchId: "1011610209",
      date: "12/29/2025",
      homeTeam: "WALNUT CREEK RC/Walnut Creek TC 40AW3.5C",
      visitorTeam: "MORAGA CC 40AW3.5A",
    });
    expect(rows[1]!.matchId).toBe("1011610210");
    expect(rows[1]!.date).toBe("1/5/2026");
    expect(rows[1]!.visitorTeam).toBe("WALNUT CREEK RC 40AW3.5B");
  });

  it("dedupes a match id seen on nested ancestor rows", () => {
    // The outer <tr> wraps the inner block, so both carry the id; only one
    // row should survive.
    const { rows } = parseMatchSummary(FIXTURE);
    expect(rows.map((r) => r.matchId)).toEqual(["1011610209", "1011610210"]);
  });

  it("falls back to ViewScore ids when no stacked blocks are present", () => {
    const html = `<div>
      <a onclick="return ViewScore(1011610209,7,&quot;False&quot;)">x</a>
      <a onclick="return ViewScore(1011610210,7,&quot;False&quot;)">y</a>
    </div>`;
    const { rows } = parseMatchSummary(html);
    expect(rows.map((r) => r.matchId)).toEqual(["1011610209", "1011610210"]);
  });
});
