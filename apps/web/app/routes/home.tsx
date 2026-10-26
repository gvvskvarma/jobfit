import { SCREENING_DISCLAIMER } from "@jobfit/shared";

export function meta() {
  return [
    { title: "JobFit" },
    {
      name: "description",
      content: "Check whether a job can sponsor your visa before you apply.",
    },
  ];
}

export default function Home() {
  return (
    <main>
      <h1>JobFit</h1>
      <p>
        Paste a job description to check sponsorship, ITAR and fit. Coming in
        milestone M2.
      </p>
      <footer>{SCREENING_DISCLAIMER}</footer>
    </main>
  );
}
