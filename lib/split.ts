import type { GenericId as Id } from "convex/values";

export type PotShare = { userId: Id<"users">; name: string; contributed: number; spent: number; balance: number };
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

type Member = { _id: Id<"users">; name: string };
type Txn = { type: "contribution" | "spend" | "refund"; amount: number; status: string; userId?: Id<"users">; planId?: Id<"plans"> };

const cents = (n: number) => Math.round(n * 100);

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
  const n = attendees.length;
  const totalCents = cents(pricePerPerson) * n;
  const sponsorCents = Math.min(
    totalCents,
    transactions.filter((t) => t.type === "contribution" && t.status === "completed" && !t.userId && t.planId === planId).reduce((s, t) => s + cents(t.amount), 0),
  );
  const baseCents = n > 0 ? Math.floor((totalCents - sponsorCents) / n) : 0;
  const extraCents = n > 0 ? (totalCents - sponsorCents) % n : 0;
  const charged = transactions.some((t) => t.type === "spend" && t.planId === planId && t.status !== "failed");
  const rows = attendees.map((a, i) => {
    const shareCents = baseCents + (i < extraCents ? 1 : 0);
    const balance = shares.find((s) => s.userId === a._id)?.balance ?? 0;
    return { userId: a._id, name: a.name, share: shareCents / 100, balance, shortBy: charged ? 0 : Math.max(0, shareCents - cents(balance)) / 100 };
  });
  return {
    experienceId,
    total: totalCents / 100,
    sponsorCredit: sponsorCents / 100,
    perPerson: (baseCents + (extraCents ? 1 : 0)) / 100,
    attendees: rows,
    allCovered: n > 0 && rows.every((r) => r.shortBy === 0),
    charged,
  };
}

export function formatDollars(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
