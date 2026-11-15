import type { GenericId as Id } from "convex/values";

export type SplitAttendee = { userId: Id<"users">; name: string; share: number; balance: number; shortBy: number };
export type PlanSplit = {
  experienceId: Id<"experiences">;
  total: number;
  sponsorCredit: number;
  perPerson: number;
  attendees: SplitAttendee[];
  allCovered: boolean;
  charged: boolean;
};

export function formatDollars(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
