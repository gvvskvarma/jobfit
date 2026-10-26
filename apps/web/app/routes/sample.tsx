import { ScreeningReport } from "@jobfit/shared";

import { Report } from "~/components/Report";
import sample from "~/lib/sample-report.json";

export function meta() {
  return [
    { title: "Sample screening report · JobFit" },
    {
      name: "description",
      content:
        "What a JobFit screening report looks like, for a fictional ITAR job.",
    },
  ];
}

export function loader() {
  return {
    jobText: sample.jobText,
    report: ScreeningReport.parse(sample.report),
  };
}

export default function Sample({
  loaderData,
}: {
  loaderData: ReturnType<typeof loader>;
}) {
  return (
    <main>
      <p className="mb-6 text-sm text-ink-muted">
        Sample report for a fictional company. The flags, verdict and summary
        come from JobFit's real screening rules.
      </p>
      <Report report={loaderData.report} jobText={loaderData.jobText} />
    </main>
  );
}
