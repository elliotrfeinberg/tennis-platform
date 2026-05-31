"use client";

// Center Court theme: light ("mm-court") ↔ dark ("mm-dark"), persisted to
// localStorage and seeded from prefers-color-scheme. The themed class lives on
// a wrapper <div className="mm mm-court|mm-dark"> in the layout; screens read
// `dark`/`toggle` from this context (e.g. the nav toggle button).

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface ThemeCtx {
  dark: boolean;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ dark: false, toggle: () => {} });

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  // Seed from storage / OS preference after mount (avoids hydration mismatch).
  useEffect(() => {
    const saved = localStorage.getItem("mm-theme");
    if (saved === "dark") setDark(true);
    else if (saved === "light") setDark(false);
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches)
      setDark(true);
  }, []);

  // Paint the document root in the theme's surface colour. With viewport-fit
  // cover, the browser can expose thin strips outside our layout (landscape
  // notch insets, dynamic-viewport rounding); tinting <html> makes any such
  // strip blend with the app instead of flashing the default white.
  useEffect(() => {
    document.documentElement.style.backgroundColor = dark ? "#0d1411" : "#ece6d8";
  }, [dark]);

  const toggle = () => {
    setDark((d) => {
      const next = !d;
      try {
        localStorage.setItem("mm-theme", next ? "dark" : "light");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <Ctx.Provider value={{ dark, toggle }}>
      <div className={`mm ${dark ? "mm-dark" : "mm-court"}`}>{children}</div>
    </Ctx.Provider>
  );
}
