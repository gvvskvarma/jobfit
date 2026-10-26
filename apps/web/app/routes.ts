import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sample", "routes/sample.tsx"),
  route("discover", "routes/discover.tsx"),
  route("employers", "routes/employers.tsx"),
  route("employers/:id", "routes/employer.tsx"),
  route("api/employers", "routes/api.employers.ts"),
  route("api/employers/:id", "routes/api.employer.ts"),
  route("api/discover", "routes/api.discover.ts"),
] satisfies RouteConfig;
