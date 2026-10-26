import { Link } from "react-router";

export function meta() {
  return [
    { title: "JobFit: check a job before you apply" },
    {
      name: "description",
      content:
        "See whether a job can sponsor your visa, and what the employer's H-1B and green card record looks like.",
    },
  ];
}

export default function Home() {
  return (
    <main className="measure">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Check a job before you apply
      </h1>
      <p className="mt-6 text-lg">
        JobFit reads a job posting for sponsorship, ITAR and contract terms,
        then checks the employer's real H-1B and green card record from public
        Department of Labor and USCIS data.
      </p>
      <p className="mt-4 text-ink-muted">
        Pasting a job description for a full screening is coming next. You can
        already look up employers and find who sponsors your role.
      </p>
      <p className="mt-4">
        <Link to="/sample" viewTransition className="font-semibold">
          See a sample screening report
        </Link>
      </p>
      <ul className="mt-8 space-y-3 text-lg">
        <li>
          <Link to="/discover" className="font-semibold">
            Find employers that sponsor H-1Bs for your role and state
          </Link>
        </li>
        <li>
          <Link to="/employers" className="font-semibold">
            Look up an employer's H-1B and green card record
          </Link>
        </li>
      </ul>
    </main>
  );
}
