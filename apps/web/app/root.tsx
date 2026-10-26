import { SCREENING_DISCLAIMER } from "@jobfit/shared";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

const NAV = [
  { to: "/", label: "Screen a job" },
  { to: "/discover", label: "Find sponsors" },
  { to: "/employers", label: "Employers" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-dvh flex-col">
        <header className="border-b border-rule">
          <nav
            aria-label="Main"
            className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline gap-x-8 gap-y-2 px-4 py-4 sm:px-6"
          >
            <NavLink
              to="/"
              className="text-lg font-bold tracking-tight no-underline"
            >
              JobFit
            </NavLink>
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-base">
              {NAV.map(({ to, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/"}
                    className={({ isActive }) =>
                      isActive
                        ? "underline decoration-2"
                        : "text-ink-muted no-underline hover:text-ink hover:underline"
                    }
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <div className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </div>
        <footer className="border-t border-rule">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-ink-muted sm:px-6">
            <p className="font-semibold text-ink">{SCREENING_DISCLAIMER}</p>
            <p>
              Employer data comes from the US Department of Labor (LCA and PERM
              disclosure files) and the USCIS H-1B Employer Data Hub.
            </p>
          </div>
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
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
    <main className="measure">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3">{details}</p>
      {stack && (
        <pre className="mt-6 overflow-x-auto bg-sheet p-4 text-sm">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
