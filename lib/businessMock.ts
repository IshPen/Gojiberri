import { useSyncExternalStore } from "react";

// Mocked business ↔ student features (offers, sponsorship rules, reviews, follows, deals) for the demo.
// Everything lives in memory on the device until the backend lands.
export const USE_MOCK = true;

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export type Perk = "discount" | "freebie";

export type MockOffer = {
  id: string;
  businessName: string;
  title: string;
  description: string;
  perk: Perk;
  discountPercent: number | null;
  school: string;
  minCrewSize: number;
  expiresAt: number;
  quantityCap: number | null;
  gojiCost: number;
  active: boolean;
  claimed: number;
  redeemed: number;
};

export type MockRule = {
  businessName: string;
  amount: number;
  monthlyBudget: number;
  spentThisMonth: number;
  active: boolean;
  chipIns: { crew: string; amount: number; attendees: number; at: number }[];
};

export type MockReview = {
  id: string;
  businessName: string;
  student: string;
  crew: string;
  stars: number;
  text: string;
  target: string;
  at: number;
  reply: string | null;
};

export type MockDeal = { id: string; businessName: string; offerId: string; sentAt: number; reach: number };

type State = {
  offers: MockOffer[];
  rules: Record<string, MockRule>;
  reviews: MockReview[];
  followers: Record<string, number>;
  following: string[];
  deals: MockDeal[];
  claims: Record<string, string>;
};

const now = Date.now();

let state: State = {
  offers: [
    { id: "of1", businessName: "Teaspoon - Palo Alto", title: "Crew boba run", description: "Bring your crew and every drink gets a free topping.", perk: "freebie", discountPercent: null, school: "Stanford", minCrewSize: 3, expiresAt: now + 6 * DAY, quantityCap: 50, gojiCost: 0, active: true, claimed: 18, redeemed: 11 },
    { id: "of2", businessName: "Coupa Cafe - Ramona", title: "Finals fuel", description: "20% off coffee and pastries for study groups.", perk: "discount", discountPercent: 20, school: "Stanford", minCrewSize: 2, expiresAt: now + 12 * DAY, quantityCap: null, gojiCost: 50, active: true, claimed: 9, redeemed: 4 },
    { id: "of3", businessName: "The Guild Theatre", title: "Student night", description: "15% off tickets when your crew books together.", perk: "discount", discountPercent: 15, school: "Stanford", minCrewSize: 4, expiresAt: now + 20 * DAY, quantityCap: 30, gojiCost: 100, active: true, claimed: 6, redeemed: 2 },
    { id: "of4", businessName: "Pizza My Heart - Palo Alto", title: "Study break slice", description: "Free garlic knots with any crew order of 3+ slices.", perk: "freebie", discountPercent: null, school: "Stanford", minCrewSize: 3, expiresAt: now + 4 * DAY, quantityCap: 40, gojiCost: 0, active: true, claimed: 22, redeemed: 17 },
  ],
  rules: {
    "The Guild Theatre": { businessName: "The Guild Theatre", amount: 10, monthlyBudget: 200, spentThisMonth: 70, active: true, chipIns: [
      { crew: "Hack Crew", amount: 10, attendees: 3, at: now - 2 * DAY },
      { crew: "Night Owls", amount: 10, attendees: 2, at: now - 4 * DAY },
      { crew: "Midnight Crew", amount: 10, attendees: 4, at: now - 6 * DAY },
    ] },
    "Teaspoon - Palo Alto": { businessName: "Teaspoon - Palo Alto", amount: 5, monthlyBudget: 100, spentThisMonth: 35, active: true, chipIns: [
      { crew: "Boba Besties", amount: 5, attendees: 2, at: now - DAY },
      { crew: "Midnight Crew", amount: 5, attendees: 4, at: now - 3 * DAY },
    ] },
  },
  reviews: [
    { id: "rv1", businessName: "Teaspoon - Palo Alto", student: "Maya", crew: "Midnight Crew", stars: 5, text: "Brown sugar boba hit different after midterms.", target: "Boba with friends", at: now - DAY, reply: "Thanks Maya! Good luck on finals." },
    { id: "rv2", businessName: "Teaspoon - Palo Alto", student: "Priya", crew: "Boba Besties", stars: 4, text: "Line was long but worth it.", target: "Teaspoon - Palo Alto", at: now - 2 * DAY, reply: null },
    { id: "rv3", businessName: "The Guild Theatre", student: "Ishan", crew: "Hack Crew", stars: 5, text: "Best music night we've had all quarter.", target: "Crew music night", at: now - DAY, reply: null },
    { id: "rv4", businessName: "The Guild Theatre", student: "Noah", crew: "Night Owls", stars: 4, text: "Great sound, seats were a bit tight.", target: "The Guild Theatre", at: now - 4 * DAY, reply: null },
    { id: "rv5", businessName: "Coupa Cafe - Ramona", student: "Leo", crew: "Side Questers", stars: 4, text: "Cozy spot to catch up.", target: "Coffee and catch-up", at: now - 2 * DAY, reply: null },
    { id: "rv6", businessName: "Pizza My Heart - Palo Alto", student: "Sam", crew: "Midnight Crew", stars: 5, text: "Cheap, fast, and the crew loved it.", target: "Pizza study break", at: now - 3 * DAY, reply: null },
  ],
  followers: { "Teaspoon - Palo Alto": 42, "Coupa Cafe - Ramona": 27, "The Guild Theatre": 35, "Pizza My Heart - Palo Alto": 51 },
  following: ["Teaspoon - Palo Alto"],
  deals: [{ id: "dl1", businessName: "Teaspoon - Palo Alto", offerId: "of1", sentAt: now - 2 * DAY, reach: 57 }],
  claims: {},
};

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export function useBusinessMock<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

const key = (name: string) => name.trim().toLowerCase();
export const sameBusiness = (a: string, b: string) => key(a) === key(b);

export function perkLabel(offer: Pick<MockOffer, "perk" | "discountPercent">) {
  return offer.perk === "discount" ? `${offer.discountPercent ?? 0}% off` : "Freebie";
}

export function offerStatus(offer: MockOffer, at = Date.now()) {
  if (!offer.active) return "Paused";
  if (offer.expiresAt <= at) return "Expired";
  if (offer.quantityCap !== null && offer.claimed >= offer.quantityCap) return "All claimed";
  return "Live";
}

export type OfferInput = Omit<MockOffer, "id" | "claimed" | "redeemed">;

export function saveOffer(input: OfferInput, id?: string) {
  if (!input.title.trim()) throw new Error("Give the offer a title");
  if (input.perk === "discount" && !(input.discountPercent && input.discountPercent >= 1 && input.discountPercent <= 100)) {
    throw new Error("Discount must be 1 to 100%");
  }
  if (input.minCrewSize < 1) throw new Error("Min crew size must be 1 or more");
  if (input.expiresAt <= Date.now()) throw new Error("Pick an expiry in the future");
  if (id) {
    const existing = state.offers.find((o) => o.id === id);
    if (!existing) throw new Error("Offer not found");
    if (input.quantityCap !== null && input.quantityCap < existing.claimed) throw new Error(`${existing.claimed} already claimed, so the cap can't go lower`);
    set({ offers: state.offers.map((o) => (o.id === id ? { ...o, ...input } : o)) });
    return id;
  }
  const newId = `of${Date.now()}`;
  set({ offers: [{ ...input, id: newId, claimed: 0, redeemed: 0 }, ...state.offers] });
  return newId;
}

export function lastDeal(businessName: string) {
  return state.deals.filter((d) => sameBusiness(d.businessName, businessName)).sort((a, b) => b.sentAt - a.sentAt)[0] ?? null;
}

export function nextDealAt(businessName: string) {
  const last = lastDeal(businessName);
  return last ? last.sentAt + WEEK : 0;
}

export function sendDeal(businessName: string, offerId: string) {
  if (nextDealAt(businessName) > Date.now()) throw new Error("You can send one deal a week");
  const reach = (state.followers[businessName] ?? 0) + 15;
  set({ deals: [...state.deals, { id: `dl${Date.now()}`, businessName, offerId, sentAt: Date.now(), reach }] });
  return reach;
}

export function saveRule(businessName: string, rule: Pick<MockRule, "amount" | "monthlyBudget" | "active">) {
  if (!(rule.amount >= 0.01)) throw new Error("Chip-in must be at least $0.01");
  if (!Number.isFinite(rule.monthlyBudget) || rule.monthlyBudget < rule.amount) throw new Error("Monthly budget must cover at least one chip-in");
  const existing = state.rules[businessName];
  set({ rules: { ...state.rules, [businessName]: { ...(existing ?? { businessName, spentThisMonth: 0, chipIns: [] }), ...rule } } });
}

export function replyToReview(reviewId: string, reply: string) {
  const text = reply.trim();
  if (!text) throw new Error("Write a reply first");
  const review = state.reviews.find((r) => r.id === reviewId);
  if (!review) throw new Error("Review not found");
  if (review.reply) throw new Error("You already replied to this review");
  set({ reviews: state.reviews.map((r) => (r.id === reviewId ? { ...r, reply: text } : r)) });
}

export function toggleFollow(businessName: string) {
  const following = state.following.some((b) => sameBusiness(b, businessName));
  set({
    following: following ? state.following.filter((b) => !sameBusiness(b, businessName)) : [...state.following, businessName],
    followers: { ...state.followers, [businessName]: Math.max(0, (state.followers[businessName] ?? 0) + (following ? -1 : 1)) },
  });
}

export function claimOffer(offerId: string) {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new Error("This offer is gone");
  if (state.claims[offerId]) return state.claims[offerId];
  const status = offerStatus(offer);
  if (status !== "Live") throw new Error(`This offer is ${status.toLowerCase()}`);
  const code = `GOJI-${Array.from({ length: 8 }, () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 32)]).join("")}`;
  set({
    claims: { ...state.claims, [offerId]: code },
    offers: state.offers.map((o) => (o.id === offerId ? { ...o, claimed: o.claimed + 1 } : o)),
  });
  return code;
}
