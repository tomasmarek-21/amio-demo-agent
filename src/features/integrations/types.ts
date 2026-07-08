export type ConnectorId =
  | "amio"
  | "notion"
  | "posthog"
  | "stripe"
  | "supabase";

export type ConnectorStatus =
  | "checking"
  | "connected"
  | "disconnected"
  | "misconfigured";

export interface ConnectorHealth {
  id: ConnectorId;
  name: string;
  status: ConnectorStatus;
  configured: boolean;
  connected: boolean;
  message: string;
  action: "oauth" | "env" | "none";
  lastCheckedAt: string;
}

export interface IntegrationsHealth {
  connectors: ConnectorHealth[];
}
