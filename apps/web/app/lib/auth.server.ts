import { clerkClient, getAuth } from "@clerk/react-router/server";
import { env } from "cloudflare:workers";

type Args = Parameters<typeof getAuth>[0];

export const agent = () => ({
  url: env.AGENT_URL,
  secret: env.AGENT_HMAC_SECRET,
});

export async function currentUserId(args: Args): Promise<string | null> {
  return (await getAuth(args)).userId ?? null;
}

export async function currentEmail(args: Args, userId: string) {
  const user = await clerkClient(args).users.getUser(userId);
  // User.email is required and unique; phone-only accounts get a placeholder.
  return user.primaryEmailAddress?.emailAddress ?? `${userId}@users.jobfit`;
}
