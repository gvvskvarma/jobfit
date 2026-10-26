import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/employers", "routes/api.employers.ts"),
  route("api/employers/:id", "routes/api.employer.ts"),
  route("api/discover", "routes/api.discover.ts"),
] satisfies RouteConfig;
