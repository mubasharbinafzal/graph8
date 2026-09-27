export interface Plan {
  title: string;
  summary: string;
  industry: string;
  country: string;
  min_employees: number;
  max_employees: number;
  target: number;
  steps: string[];
}
export interface Score {
  score: number;
  qualified: boolean;
  reasons: string[];
  caveat: string;
}
export interface Lead {
  company: string;
  domain: string;
  industry: string;
  employees: string;
  location: string;
  name: string;
  role: string;
  email: string;
  contact_id: number | null;
  score: Score | null;
  message: { subject: string; body: string } | null;
  reply: string | null;
  analysis: {
    classification: string;
    confidence: number;
    explanation: string;
  } | null;
  recommendation: {
    action: string;
    reason: string;
    requires_approval: boolean;
  } | null;
}
export interface Mission {
  id: string;
  goal: string;
  plan: Plan;
  demo: boolean;
  status:
    | "ready"
    | "running"
    | "awaiting_approval"
    | "awaiting_outreach"
    | "waiting_reply"
    | "complete"
    | "paused"
    | "error";
  stage: number;
  progress: number;
  events: {
    id: number;
    time: string;
    agent: string;
    title: string;
    detail: string;
  }[];
  metrics: {
    found: number;
    qualified: number;
    outreach: number;
    interested: number;
    meetings: number;
  };
  lead: Lead | null;
  error: string | null;
  graph8_url: string;
  booking: Record<string, unknown> | null;
  action_in_flight: string | null;
}
export type Screen = "mission" | "command" | "intelligence" | "result";
