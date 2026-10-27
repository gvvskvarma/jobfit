import { currentUserId } from "~/lib/auth.server";
import { PostingError, fetchPosting, postingText } from "~/lib/posting.server";

import type { Route } from "./+types/api.posting";

/** Pulls a posting's text from its link so the user can check it before screening. */
export async function action(args: Route.ActionArgs) {
  if (!(await currentUserId(args))) {
    return Response.json(
      { error: "Sign in to pull a posting." },
      { status: 401 },
    );
  }
  const url = String((await args.request.formData()).get("url") ?? "");
  try {
    return { text: postingText(await fetchPosting(url)) };
  } catch (e) {
    if (e instanceof PostingError) return { error: e.message };
    throw e;
  }
}
