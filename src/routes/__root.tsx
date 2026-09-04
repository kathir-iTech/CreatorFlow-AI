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
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/vite.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative min-h-dvh px-safe">
        <Header />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 pb-safe">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}
