import { NextResponse } from "next/server";
import { notionOAuthService } from "@/features/notion/container";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await notionOAuthService.getStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
