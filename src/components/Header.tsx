import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles, History, Activity, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";

const NAV = [
  { to: "/", label: "Studio", icon: Sparkles },
  { to: "/history", label: "History", icon: History },
  { to: "/status", label: "Status", icon: Activity },
] as const;

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="glass inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 transition hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function Header() {
  const { location } = useRouterState();
  return (
    <header className="sticky top-0 z-40 pt-safe">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:flex md:justify-between">
        <Link
          to="/"
          aria-label="CreatorFlow AI home"
          className="group flex min-w-0 items-center gap-2.5"
        >
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#FFB020] shadow-lg shadow-amber-500/20">
            <Sparkles className="h-5 w-5 text-[#09090B]" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-[15px] font-medium tracking-tight">
              CreatorFlow <span className="text-[#FFB020]">AI</span>
            </div>
            <div className="hidden truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:block">
              captions · seo · thumbnail · schedule
            </div>
          </div>
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 rounded-full border border-white/[0.06] bg-[#1A1A1E]/60 p-1 backdrop-blur-xl md:flex"
        >
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB020]/50",
                  active
                    ? "bg-[#FFB020] text-[#09090B]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[11px] tracking-[0.12em] text-muted-foreground sm:inline">
            BETA
          </span>
          <ThemeToggle />
        </div>
      </div>

      <nav
        aria-label="Primary mobile"
        className="mx-4 mb-2 flex items-center justify-around rounded-2xl border border-white/[0.06] bg-[#1A1A1E]/60 p-1 backdrop-blur-xl md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB020]/50",
                active ? "bg-[#FFB020] text-[#09090B]" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
