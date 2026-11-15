import type { GenericId as Id } from "convex/values";

export type PotShare = { userId: Id<"users">; name: string; contributed: number; spent: number; balance: number };
export type SplitAttendee = { userId: Id<"users">; name: string; balance: number; shortBy: number };
export type PlanSplit = {
  experienceId: Id<"experiences">;
  total: number;
  sponsorCredit: number;
  perPerson: number;
  attendees: SplitAttendee[];
  allCovered: boolean;
  charged: boolean;
};

type Member = { _id: Id<"users">; name: string };
type Txn = { type: "contribution" | "spend" | "refund"; amount: number; status: string; userId?: Id<"users">; planId?: Id<"plans"> };

const roundUpCents = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

export function mockPotShares(members: Member[], transactions: Txn[]): PotShare[] {
  return members.map((m) => {
    const mine = transactions.filter((t) => t.userId === m._id && t.status === "completed");
    const contributed = mine.filter((t) => t.type === "contribution").reduce((s, t) => s + t.amount, 0);
    const spent = mine.filter((t) => t.type === "spend").reduce((s, t) => s + t.amount, 0);
    return { userId: m._id, name: m.name, contributed, spent, balance: contributed - spent };
  });
}

export function mockPlanSplit(args: {
  planId: Id<"plans">;
  experienceId: Id<"experiences">;
  pricePerPerson: number;
  attendees: Member[];
  shares: PotShare[];
  transactions: Txn[];
}): PlanSplit {
  const { planId, experienceId, pricePerPerson, attendees, shares, transactions } = args;
  const count = Math.max(attendees.length, 1);
  const total = pricePerPerson * attendees.length;
  const sponsorCredit = Math.min(
    total,
    transactions.filter((t) => t.type === "contribution" && t.status === "completed" && !t.userId && t.planId === planId).reduce((s, t) => s + t.amount, 0),
  );
  const perPerson = roundUpCents((total - sponsorCredit) / count);
  const rows = attendees.map((a) => {
    const balance = shares.find((s) => s.userId === a._id)?.balance ?? 0;
    return { userId: a._id, name: a.name, balance, shortBy: roundUpCents(Math.max(0, perPerson - balance)) };
  });
  return {
    experienceId,
    total,
    sponsorCredit,
    perPerson,
    attendees: rows,
    allCovered: rows.every((r) => r.shortBy === 0),
    charged: transactions.some((t) => t.type === "spend" && t.planId === planId && t.status !== "failed"),
  };
}

export function formatDollars(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
