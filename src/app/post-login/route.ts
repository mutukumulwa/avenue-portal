import { auth } from "@/lib/auth";
import { resolvePostLoginPath } from "@/lib/post-login";
import { NextResponse, type NextRequest } from "next/server";

// BD-03: `/post-login` used to be an RSC page whose only job was to redirect.
// In production an intermittent auth/session/render abort left users stranded at
// `GET /post-login?_rsc=… → 503` (React #419), blocking ALL logins. A route
// handler is a plain HTTP endpoint — it reads the session directly and returns a
// normal redirect, with no Suspense boundary to abort and no RSC payload to
// prefetch. Never statically evaluated.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();

  // Unauthenticated (or session lost) → back to login, never a stranded 503.
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const target = resolvePostLoginPath(session.user.role);
  return NextResponse.redirect(new URL(target, req.url));
}
