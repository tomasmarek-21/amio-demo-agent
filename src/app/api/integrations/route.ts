import { getIntegrationsHealth } from "@/features/integrations/health-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getIntegrationsHealth(), {
    headers: { "Cache-Control": "no-store" },
  });
}
