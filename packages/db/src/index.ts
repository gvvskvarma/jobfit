import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client";

export * from "./generated/client";

export function createDb(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
