import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import "./mm.css";
import { ThemeProvider } from "@/components/mm/ThemeProvider";
import { Nav } from "@/components/mm/ui";
import { ScopeBar } from "@/components/mm/ScopeBar";
import { getScopeTree } from "@/lib/scope";

export const metadata: Metadata = {
  title: "MatchMetric — estimated NTRP ratings",
  description:
    "Daily-updated estimated NTRP ratings, captain lineup tools, and match win probabilities. Not affiliated with USTA.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const scopeTree = await getScopeTree();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700&family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <Nav />
          <Suspense fallback={<div style={{ minHeight: 52, borderBottom: "1px solid var(--hair)", background: "var(--paper)" }} />}>
            <ScopeBar tree={scopeTree} />
          </Suspense>
          <main>{children}</main>
          <footer
            className="mm-footer"
            style={{
              borderTop: "1px solid var(--hair)",
              padding: "26px 44px",
              textAlign: "center",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            Estimated ratings, not official USTA. Daily-updated from public
            TennisLink data.
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
