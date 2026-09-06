import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Outlet,
  Link,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Header } from "@/components/Header";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0b0a18" },
      { name: "color-scheme", content: "dark light" },
      { title: "CreatorFlow AI — Creator Workflow Automation" },
      {
        name: "description",
        content:
          "CreatorFlow AI automates your creator workflow: captions, SEO, thumbnails, and scheduling — all in one flow.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "CreatorFlow AI" },
      { property: "og:title", content: "CreatorFlow AI — Creator Workflow Automation" },
      {
        property: "og:description",
        content:
          "Paste one YouTube link, get captions, SEO, thumbnails, and a posting schedule — the whole pre-publish workflow automated in one pipeline.",
      },
      { property: "og:url", content: "https://creatorflowai-two.vercel.app/" },
      { property: "og:image", content: "https://creatorflowai-two.vercel.app/favicon.png" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "CreatorFlow AI — Creator Workflow Automation" },
      {
        name: "twitter:description",
        content:
          "Paste one YouTube link, get captions, SEO, thumbnails, and a posting schedule — the whole pre-publish workflow automated in one pipeline.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/vite.svg" },
      { rel: "canonical", href: "https://creatorflowai-two.vercel.app/" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <>
      <HeadContent />
      {children}
      <Scripts />
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#0A0A0C]/50 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
        <span className="font-mono tracking-wide">© 2026 CreatorFlow AI — edit-bay for creators</span>
        <span className="flex items-center gap-3">
          <span className="hidden sm:inline">Captions · SEO · Thumbnail · Schedule</span>
          <span className="h-3 w-px bg-white/10 hidden sm:inline" />
          <span className="text-[11px] tracking-[0.1em]">BUILT FOR CREATORS, NOT DASHBOARDS</span>
        </span>
      </div>
    </footer>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative min-h-dvh px-safe flex flex-col">
        <Header />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 pb-safe">
          <Outlet />
        </main>
        <Footer />
      </div>
    </QueryClientProvider>
  );
}
