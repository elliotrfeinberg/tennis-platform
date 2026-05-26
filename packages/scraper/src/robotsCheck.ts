// Minimal robots.txt check.
//
// We only support User-agent: * and the Disallow directive — enough for
// tennislink's likely robots.txt. If they have a specific UA rule pointed
// at us we'll handle it case-by-case.

export interface RobotsRules {
  disallow: string[]; // path prefixes blocked for everyone
}

export function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const disallow: string[] = [];
  let currentGroupApplies = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!key) continue;
    const k = key.toLowerCase();
    if (k === "user-agent") {
      currentGroupApplies = value === "*";
    } else if (k === "disallow" && currentGroupApplies) {
      if (value) disallow.push(value);
    }
  }
  return { disallow };
}

export function isAllowed(url: string, rules: RobotsRules): boolean {
  const u = new URL(url);
  for (const prefix of rules.disallow) {
    if (u.pathname.startsWith(prefix)) return false;
  }
  return true;
}
