"use client";

// Custom pull-to-refresh for the mobile app-shell. Native PTR only fires on
// document scroll, but our shell scrolls <main> internally — so we implement
// the gesture ourselves on that container: when it's at the top and the user
// drags down past a threshold, we run router.refresh() (a soft server refetch)
// and show a spinner. Direct DOM style mutation in the move handler keeps it
// at 60fps without a React render per touch frame.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const TRIGGER = 64; // resisted px to cross before a release refreshes
const MAX = 96; // cap on how far the indicator travels

export function PullToRefresh() {
  const router = useRouter();
  const indRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    let startY = 0;
    let mainTop = 0;
    let pulling = false;
    let dist = 0;

    const place = (d: number) => {
      const el = indRef.current;
      if (!el) return;
      const t = Math.min(d, MAX);
      el.style.top = mainTop + "px";
      el.style.transform = `translateX(-50%) translateY(${t * 0.6 + 6}px)`;
      el.style.opacity = String(Math.min(1, d / TRIGGER));
    };

    const onStart = (e: TouchEvent) => {
      // mobile app-shell only; ignore unless <main> is the scroller at its top
      if (!window.matchMedia("(max-width: 760px)").matches) return;
      if (refreshing || main.scrollTop > 0) { pulling = false; return; }
      startY = e.touches[0]?.clientY ?? 0;
      mainTop = main.getBoundingClientRect().top;
      pulling = true;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling || refreshing) return;
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY;
      if (dy <= 0 || main.scrollTop > 0) { pulling = false; place(0); return; }
      dist = dy * 0.5; // drag resistance
      place(dist);
      if (dy > 4 && e.cancelable) e.preventDefault(); // suppress inner rubber-band
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      if (dist >= TRIGGER) setRefreshing(true);
      else place(0);
    };

    main.addEventListener("touchstart", onStart, { passive: true });
    main.addEventListener("touchmove", onMove, { passive: false });
    main.addEventListener("touchend", onEnd, { passive: true });
    main.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      main.removeEventListener("touchstart", onStart);
      main.removeEventListener("touchmove", onMove);
      main.removeEventListener("touchend", onEnd);
      main.removeEventListener("touchcancel", onEnd);
    };
  }, [refreshing]);

  // Pin the spinner while refreshing, kick the server refetch, then release.
  useEffect(() => {
    if (!refreshing) return;
    const el = indRef.current;
    if (el) {
      el.style.transition = "transform .2s ease, opacity .2s ease";
      el.style.transform = `translateX(-50%) translateY(${TRIGGER * 0.6 + 6}px)`;
      el.style.opacity = "1";
    }
    router.refresh();
    const t = setTimeout(() => {
      setRefreshing(false);
      const e2 = indRef.current;
      if (e2) {
        e2.style.transform = "translateX(-50%) translateY(0px)";
        e2.style.opacity = "0";
        setTimeout(() => { if (e2) e2.style.transition = ""; }, 260);
      }
    }, 850);
    return () => clearTimeout(t);
  }, [refreshing, router]);

  return (
    <div
      ref={indRef}
      className="mm-mobile-only"
      aria-hidden
      style={{
        position: "fixed", top: 0, left: "50%", zIndex: 45,
        transform: "translateX(-50%) translateY(0px)", opacity: 0, pointerEvents: "none",
        width: 34, height: 34, borderRadius: 999,
        background: "var(--card)", border: "1px solid var(--hair)", boxShadow: "var(--shadow)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <svg
        width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--court)"
        strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
        style={{ animation: refreshing ? "mm-spin .7s linear infinite" : "none" }}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </div>
  );
}
