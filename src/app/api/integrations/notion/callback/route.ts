import { NextResponse } from "next/server";
import { notionOAuthService } from "@/features/notion/container";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError || !code || !state) {
    return NextResponse.redirect(new URL("/?notion=error", url.origin));
  }
  try {
    await notionOAuthService.completeAuthorization({
      code,
      state,
      origin: url.origin,
    });
    return NextResponse.redirect(new URL("/?notion=connected", url.origin));
  } catch {
    return NextResponse.redirect(new URL("/?notion=error", url.origin));
  }
}
