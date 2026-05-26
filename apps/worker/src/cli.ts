#!/usr/bin/env node
// Worker CLI. Three subcommands so the first-crawl loop is fast:
//
//   capture <url> <out>
//     Fetch one URL through PoliteFetcher, write raw HTML to disk.
//     Use this to grab a few tennislink pages for parser test fixtures.
//
//   parse <kind> <html-file>
//     Run a parser on a saved HTML file, dump the structured output.
//     Iterate on selectors locally without re-hitting tennislink.
//
//   robots <host>
//     Fetch and print robots.txt for a host. Sanity check before crawling.
//
// All commands respect TENNIS_CONTACT_EMAIL — required.
//
// Crawl + ingest is wired separately once selectors are stable.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  PoliteFetcher,
  parsePlayerHistory,
  parsePlayerSearch,
  parseRobots,
} from "@tennis/scraper";

const CONTACT = process.env.TENNIS_CONTACT_EMAIL;
const UA = process.env.TENNIS_USER_AGENT ?? "TennisPlatform/0.1";

function requireContact(): string {
  if (!CONTACT) {
    console.error(
      "Missing TENNIS_CONTACT_EMAIL env var. Required for polite crawling so site\n" +
        "admins can reach us if our crawler causes issues."
    );
    process.exit(2);
  }
  return CONTACT;
}

function makeFetcher(): PoliteFetcher {
  return new PoliteFetcher({
    userAgent: UA,
    contactEmail: requireContact(),
  });
}

async function capture(url: string, outPath: string) {
  const fetcher = makeFetcher();
  console.error(`Fetching ${url}`);
  const result = await fetcher.fetch(url);
  if (result.finalUrl !== url) {
    console.error(`  redirected -> ${result.finalUrl}`);
  }
  console.error(
    `  status=${result.status} bytes=${result.body?.length ?? 0} etag=${
      result.etag ?? "-"
    }`
  );
  if (!result.body) {
    if (result.status === 304) {
      console.error("304 Not Modified — no body to write.");
    } else {
      console.error(`Status ${result.status}, no body to write.`);
    }
    return;
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, result.body, "utf8");
  console.error(`Wrote ${outPath}`);
}

async function parse(kind: string, htmlFile: string) {
  const html = await readFile(htmlFile, "utf8");
  switch (kind) {
    case "search": {
      const rows = parsePlayerSearch(html);
      console.log(JSON.stringify(rows, null, 2));
      console.error(`Parsed ${rows.length} search rows.`);
      break;
    }
    case "history": {
      // For ad-hoc parse runs we don't know the tennislink id; the caller
      // can pass --id, but for now use a placeholder so the parser runs.
      const parsed = parsePlayerHistory(html, "(unknown)");
      console.log(JSON.stringify(parsed, null, 2));
      console.error(`Parsed ${parsed.matches.length} matches.`);
      break;
    }
    case "robots": {
      const rules = parseRobots(html);
      console.log(JSON.stringify(rules, null, 2));
      break;
    }
    default:
      console.error(`Unknown parser kind: ${kind}`);
      console.error("Available: search, history, robots");
      process.exit(2);
  }
}

async function robots(host: string) {
  const fetcher = makeFetcher();
  const url = `https://${host}/robots.txt`;
  const result = await fetcher.fetch(url);
  if (result.body) {
    console.log(result.body);
  } else {
    console.error(`Status ${result.status}, no body.`);
  }
}

function usage(): never {
  console.error(`Usage:
  tennis-scrape capture <url> <out-file>
  tennis-scrape parse <kind> <html-file>     (kind: search|history|robots)
  tennis-scrape robots <host>

Env:
  TENNIS_CONTACT_EMAIL  (required) email site admins can use to contact you
  TENNIS_USER_AGENT     (optional) UA string; default 'TennisPlatform/0.1'
`);
  process.exit(2);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "capture":
      if (args.length !== 2) usage();
      await capture(args[0]!, args[1]!);
      break;
    case "parse":
      if (args.length !== 2) usage();
      await parse(args[0]!, args[1]!);
      break;
    case "robots":
      if (args.length !== 1) usage();
      await robots(args[0]!);
      break;
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
