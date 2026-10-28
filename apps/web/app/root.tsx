import {
  ClerkProvider,
  Show,
  SignInButton,
  UserButton,
} from "@clerk/react-router";
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server";
import { SCREENING_DISCLAIMER } from "@jobfit/shared";
import { env } from "cloudflare:workers";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

const NAV = [
  { to: "/", label: "Screen" },
  { to: "/bank", label: "Bank" },
  { to: "/discover", label: "Sponsors" },
  { to: "/employers", label: "Employers" },
];

export const middleware: Route.MiddlewareFunction[] = [
  clerkMiddleware({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  }),
];

export const loader = (args: Route.LoaderArgs) => rootAuthLoader(args);

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

const TITLES: [string, string][] = [
  ["/jobs/", "~/jobs"],
  ["/employers", "~/employers"],
  ["/discover", "~/sponsors"],
  ["/sample", "~/sample"],
  ["/bank", "~/bank"],
];

/** The terminal window every page lives in; the error boundary renders it without Clerk. */
function Shell({
  account,
  children,
}: {
  account?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const cwd = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? "~/screen";
  return (
    <div className="flex min-h-dvh flex-col sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden border-rule bg-paper sm:rounded-[var(--radius-window)] sm:border sm:shadow-[0_40px_100px_-40px_color-mix(in_srgb,var(--accent)_55%,transparent)]">
        <header className="flex items-center gap-4 border-b border-rule px-4 py-2.5">
          <span aria-hidden className="flex gap-2">
            <i className="size-3 rounded-full bg-[#ff5f57]" />
            <i className="size-3 rounded-full bg-[#febc2e]" />
            <i className="size-3 rounded-full bg-[#28c840]" />
          </span>
          <p className="min-w-0 flex-1 truncate text-center text-sm text-ink-muted">
            <NavLink to="/" className="font-semibold text-ink no-underline">
              jobfit
            </NavLink>{" "}
            — {cwd}
          </p>
          <div className="flex min-w-12 justify-end">{account}</div>
        </header>
        <nav
          aria-label="Main"
          className="flex flex-wrap items-center gap-x-1 gap-y-1 px-4 pt-3 text-sm sm:px-8"
        >
          <span aria-hidden className="mr-1 text-ink-muted">
            ←
          </span>
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `rounded-[2px] px-1.5 py-0.5 no-underline ${
                  isActive
                    ? "bg-spectrum font-semibold text-on-accent"
                    : "text-ink hover:bg-select"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span aria-hidden>{isActive ? "◼" : "◻"} </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
          <span aria-hidden className="ml-1 text-ink-muted">
            →
          </span>
        </nav>
        <div className="w-full min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </div>
        <footer className="space-y-1 border-t border-rule px-4 py-3 sm:px-8">
          <p className="text-sm font-semibold">{SCREENING_DISCLAIMER}</p>
          <p className="text-xs text-ink-muted">
            Employer data comes from the US Department of Labor (LCA and PERM
            disclosure files) and the USCIS H-1B Employer Data Hub.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Account() {
  return (
    <>
      <Show when="signed-in">
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-[2px] px-1.5 text-sm font-semibold text-accent hover:bg-select"
          >
            Sign in
          </button>
        </SignInButton>
      </Show>
    </>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <ClerkProvider loaderData={loaderData}>
      <Shell account={<Account />}>
        <Outlet />
      </Shell>
    </ClerkProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let details = "The page couldn't load. Try again in a moment.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : title;
    details =
      error.status === 404
        ? "Check the address, or search for the employer by name."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <Shell>
      <main className="measure">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-3">{details}</p>
        {stack && (
          <pre className="mt-6 overflow-x-auto rounded-[var(--radius-sheet)] bg-sheet p-4 text-sm">
            <code>{stack}</code>
          </pre>
        )}
      </main>
    </Shell>
  );
}
