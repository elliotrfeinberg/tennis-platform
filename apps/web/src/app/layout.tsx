import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tennis Platform",
  description:
    "Daily-updated estimated NTRP ratings, captain lineup tools, and match win probabilities. Not affiliated with USTA.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold">
              🎾 Tennis Platform
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/players" className="hover:underline">
                Players
              </Link>
              <Link href="/teams" className="hover:underline">
                Teams
              </Link>
              <Link href="/ratings" className="hover:underline">
                Ratings
              </Link>
              <Link href="/captain" className="font-medium text-court-700 hover:underline">
                Captain tools
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t border-stone-200 py-6 text-center text-xs text-stone-500">
          Estimated ratings, not official USTA. Daily-updated from public
          tennislink data.
        </footer>
      </body>
    </html>
  );
}
