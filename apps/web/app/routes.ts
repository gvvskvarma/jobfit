import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sample", "routes/sample.tsx"),
  route("discover", "routes/discover.tsx"),
  route("employers", "routes/employers.tsx"),
  route("employers/:id", "routes/employer.tsx"),
  route("api/employers", "routes/api.employers.ts"),
  route("api/employers/:id", "routes/api.employer.ts"),
  route("jobs/:id", "routes/job.tsx"),
  route("api/discover", "routes/api.discover.ts"),
  route("api/jobs", "routes/api.jobs.ts"),
  route("api/jobs/:id/screen", "routes/api.job-screen.ts"),
] satisfies RouteConfig;
