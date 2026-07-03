import { NextResponse } from "next/server";
import { notionOAuthService } from "@/features/notion/container";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const authorizationUrl =
      await notionOAuthService.startAuthorization(origin);
    return NextResponse.redirect(authorizationUrl);
  } catch {
    return NextResponse.redirect(
      new URL("/?notion=error", request.url),
    );
  }
}
