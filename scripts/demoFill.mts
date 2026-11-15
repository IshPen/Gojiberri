// Fills the demo deployment with realistic activity through public functions only.
// Run after demo:resetDemo (seed). Safe to re-run: every step checks state first.
//   CONVEX_URL=https://flippant-marten-689.convex.cloud npx tsx scripts/demoFill.mts
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { addDays, localDate, localTime, MINUTE, weekday } from "../convex/time.js";

const URL_ = process.env.CONVEX_URL ?? "https://flippant-marten-689.convex.cloud";
const c = new ConvexHttpClient(URL_);
const FILL_MINUTES = 150; // demoFill plans use 2.5h windows; seed plans use 3h
type Id = any;

const now = Date.now();
const today = localDate(now);
const nextWeekday = (day: number) => addDays(today, ((day - weekday(today) + 7) % 7) || 7);
const fillWindow = (date: string, hour: number) => {
  const start = localTime(date, hour);
  return { start, end: start + FILL_MINUTES * MINUTE };
};
const isFill = (p: any) => p.window.end - p.window.start === FILL_MINUTES * MINUTE;
const winner = (p: any) => p.options[p.winningIndex ?? 0]?.title ?? "";
const log = (...a: unknown[]) => console.log("•", ...a);

const board = await c.query(api.points.groupLeaderboard, { limit: 100 });
const crews = new Map<string, { _id: Id; name: string; members: { _id: Id; name: string }[] }>();
for (const row of board) {
  const g = await c.query(api.groups.getGroup, { groupId: row.groupId });
  if (g) crews.set(g.name, g as any);
}
const crew = (name: string) => {
  const g = crews.get(name);
  if (!g) throw new Error(`Crew ${name} not found; run resetDemo first`);
  return g;
};
const member = (crewName: string, name: string) => {
  const m = crew(crewName).members.find((x) => x.name === name);
  if (!m) throw new Error(`${name} is not in ${crewName}`);
  return m._id;
};
const plansOf = async (crewName: string) =>
  (await c.query(api.plans.getGroupPlans, { groupId: crew(crewName)._id })).sort((a: any, b: any) => a.window.start - b.window.start);

async function waitForStatus(planId: Id, statuses: string[], timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const plan = await c.query(api.plans.getPlan, { planId });
    if (plan && statuses.includes(plan.status)) return plan;
    if (Date.now() > deadline) throw new Error(`Plan ${planId} stuck in ${plan?.status}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const ptHour = (ms: number) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(ms));

// A crew's demo-fill plans are told apart by their Pacific start hour, so a rerun on a later day finds them.
async function fillPlan(crewName: string, window: { start: number; end: number }, seedExperienceId?: Id) {
  const existing = (await plansOf(crewName)).find(
    (p: any) => isFill(p) && ptHour(p.window.start) === ptHour(window.start) && p.status !== "cancelled",
  );
  if (existing) {
    await waitForStatus(existing._id, ["voting", "locked", "done"]);
    return existing._id as Id;
  }
  const planId = await c.mutation(api.plans.createPlan, {
    userId: crew(crewName).members[0]._id,
    groupId: crew(crewName)._id,
    window,
    seedExperienceId,
  });
  log(`${crewName}: created plan, waiting for suggestions`);
  await waitForStatus(planId, ["voting", "locked", "done"]);
  return planId as Id;
}

async function vote(userId: Id, planId: Id, optionIndex: number) {
  const plan = await c.query(api.plans.getPlan, { planId });
  if (plan?.status !== "voting" || plan.votes.some((v: any) => v.userId === userId)) return;
  await c.mutation(api.votes.castVote, { userId, planId, optionIndex });
}

// Photo check-ins through the real upload + savePhoto path (awards Gojis on first check-in).
async function checkIn(crewName: string, planId: Id, userName: string, seed: string, caption: string) {
  const story = await c.query(api.photos.getGroupStory, { groupId: crew(crewName)._id });
  if (story.some((p: any) => p.planId === planId && p.userName === userName)) return;
  const image = await fetch(`https://picsum.photos/seed/${seed}/900/1200`);
  if (!image.ok) throw new Error(`Image fetch failed: ${image.status}`);
  const uploadUrl = await c.mutation(api.photos.generateUploadUrl, {});
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: await image.arrayBuffer() });
  const { storageId } = await res.json();
  const result = await c.mutation(api.photos.savePhoto, { userId: member(crewName, userName), storageId, planId, caption });
  log(`${crewName}: ${userName} checked in (+${result.total} Gojis)`);
}

async function mockPay(checkoutUrl: string) {
  const url = new URL(checkoutUrl);
  const token = url.searchParams.get("token")!;
  const res = await fetch(`${url.origin}/whop/mock-pay`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  if (!res.ok) throw new Error(`Mock payment failed (${res.status}): ${await res.text()}`);
}

// Pot contributions through the WHOP_MOCK checkout: action -> mock checkout -> /whop/mock-pay.
async function contribute(crewName: string, userName: string, amount: number) {
  const groupId = crew(crewName)._id;
  let pot = await c.query(api.funds.getPot, { groupId });
  if (!pot) {
    await c.mutation(api.funds.createPot, { groupId, monthlyContribution: 20 });
    pot = await c.query(api.funds.getPot, { groupId });
  }
  const userId = member(crewName, userName);
  if (pot!.transactions.some((t: any) => t.userId === userId && t.whopPaymentId?.startsWith("mock_pay_"))) return;
  await mockPay(await c.action(api.whop.createContributionCheckout, { userId, groupId, amount }));
  log(`${crewName}: ${userName} chipped in $${amount}`);
}

async function rate(planId: Id, userId: Id, stars: number, vibe: string) {
  await c.mutation(api.ratings.submitRating, { userId, planId, stars, vibe });
}

const experiences = await c.query(api.experiences.listExperiences, {} as any);
const exp = (title: string) => experiences.find((e: any) => e.title === title)!;
const sponsors = await c.query(api.sponsors.listActive, {});
const sponsor = (business: string) => sponsors.find((s: any) => s.business === business)!;
const redeemers = await c.query(api.redemptions.listRedeemers, {});
const businessId = (name: string) => redeemers.find((r: any) => r.type === "business" && r.name === name)!.id;

// 1. Hack Crew pot: real mock-Whop contributions on top of the seeded $10/$15/$10 + $10 sponsor chip-in.
//    Uma 25, Ishan 25, Gauri 20 against a ~$22.67 share of the locked music night: Gauri ends up slightly short.
await contribute("Hack Crew", "Uma", 15);
await contribute("Hack Crew", "Ishan", 10);
await contribute("Hack Crew", "Gauri", 10);

// 2. Hack Crew past outings: photo check-ins (oldest first so streak bonuses build up).
const hackPlans = await plansOf("Hack Crew");
const hackDone = hackPlans.filter((p: any) => p.status === "done" && !isFill(p));
const garden = hackDone.find((p: any) => winner(p) === "Arizona Garden");
const pizzaOld = hackDone.find((p: any) => winner(p) === "Pizza My Heart - Palo Alto");
const guildPast = hackDone.find((p: any) => winner(p) === "The Guild Theatre");
const teaspoon = hackDone.find((p: any) => winner(p) === "Teaspoon - Palo Alto");
const pizzaRecent = [...hackDone].reverse().find((p: any) => winner(p) === "Pizza My Heart - Palo Alto");
if (garden) {
  await checkIn("Hack Crew", garden._id, "Uma", "goji-garden-1", "cactus garden golden hour 🌵");
  await checkIn("Hack Crew", garden._id, "Gauri", "goji-garden-2", "found the best bench on campus");
}
if (pizzaOld) {
  await checkIn("Hack Crew", pizzaOld._id, "Uma", "goji-pizza-1", "pesto slice supremacy 🍕");
  await checkIn("Hack Crew", pizzaOld._id, "Ishan", "goji-pizza-2", "midterm fuel");
}
const kepler = hackDone.find((p: any) => winner(p) === "Kepler's Books");
if (kepler) await checkIn("Hack Crew", kepler._id, "Uma", "goji-books-1", "rainy day book haul 📚");
if (guildPast) await checkIn("Hack Crew", guildPast._id, "Uma", "goji-guild-1", "front row at the Guild 🎶");
if (teaspoon) await checkIn("Hack Crew", teaspoon._id, "Gauri", "goji-boba-1", "brown sugar boba run");
if (pizzaRecent && pizzaRecent !== pizzaOld) await checkIn("Hack Crew", pizzaRecent._id, "Ishan", "goji-pizza-3", "post-hackathon slices");

// 3. Hack Crew live vote for next Saturday: two votes split 1-1, Uma decides on stage.
const hackVote = await fillPlan("Hack Crew", fillWindow(nextWeekday(6), 18));
await vote(member("Hack Crew", "Ishan"), hackVote, 0);
await vote(member("Hack Crew", "Gauri"), hackVote, 1);

// 4. Midnight Crew stays a little ahead (gap < 50/3, so one Hack Crew check-in flips #1):
//    late check-ins on seeded outings, a Friday outing, and a full-crew outing last night.
const midnight = (await plansOf("Midnight Crew")).filter((p: any) => p.status === "done" && !isFill(p));
const midGarden = midnight.find((p: any) => winner(p) === "Arizona Garden");
const midBoba = midnight.find((p: any) => winner(p) === "Teaspoon - Palo Alto");
if (midGarden) await checkIn("Midnight Crew", midGarden._id, "Sam", "goji-mid-1", "late but made it");
if (midBoba) {
  await checkIn("Midnight Crew", midBoba._id, "Leo", "goji-mid-2", "taro or bust");
  await checkIn("Midnight Crew", midBoba._id, "Sam", "goji-mid-3", "second round of boba");
}
const midFriday = await fillPlan("Midnight Crew", fillWindow(addDays(today, -2), 20));
for (const name of ["Maya", "Leo", "Priya"]) await vote(member("Midnight Crew", name), midFriday, 0);
await waitForStatus(midFriday, ["locked", "done"]);
await checkIn("Midnight Crew", midFriday, "Maya", "goji-midfri-1", "solo mission, crew was asleep");
await rate(midFriday, member("Midnight Crew", "Maya"), 4, "chill");
const midNight = await fillPlan("Midnight Crew", fillWindow(addDays(today, -1), 19));
for (const name of ["Maya", "Leo", "Priya"]) await vote(member("Midnight Crew", name), midNight, 0);
await waitForStatus(midNight, ["locked", "done"]);
const midCaptions: Record<string, string> = { Maya: "saturday night crew 🌙", Leo: "we stayed till close", Priya: "10/10 would redo", Sam: "the whole crew showed up" };
for (const [i, name] of ["Maya", "Leo", "Priya", "Sam"].entries()) {
  await checkIn("Midnight Crew", midNight, name, `goji-midnight-${i}`, midCaptions[name]);
  await rate(midNight, member("Midnight Crew", name), [5, 4, 5, 4][i], ["lively", "cozy", "would-redo", "lively"][i]);
}

// 5. Other crews this week.
const lastDone = async (crewName: string, title: string) =>
  (await plansOf(crewName)).find((p: any) => p.status === "done" && !isFill(p) && winner(p) === title);
const owls = await lastDone("Night Owls", "Coupa Cafe - Ramona");
if (owls) await checkIn("Night Owls", owls._id, "Chloe", "goji-owls-1", "3am coffee debrief ☕");
const sunset = await lastDone("Sunset Crew", "Genki Crepes");
if (sunset) await checkIn("Sunset Crew", sunset._id, "Kai", "goji-sunset-1", "crepes after the beach");
const boulder = await lastDone("Boulder Buddies", "Movement San Francisco");
if (boulder) await checkIn("Boulder Buddies", boulder._id, "Diego", "goji-boulder-1", "sent my first V4 🧗");

// 6. Pot-paid bookings so business dashboards show sales: lock an experience plan and charge the crew card.
async function bookedOuting(crewName: string, people: [string, number][], experienceTitle: string, date: string, hour: number) {
  for (const [name, amount] of people) await contribute(crewName, name, amount);
  const experience = exp(experienceTitle);
  const planId = await fillPlan(crewName, fillWindow(date, hour), experience._id);
  let plan = await c.query(api.plans.getPlan, { planId });
  const index = plan!.options.findIndex((o: any) => o.experienceId === experience._id);
  for (const [name] of people) await vote(member(crewName, name), planId, index);
  plan = await waitForStatus(planId, ["locked", "done"]);
  if (plan.status !== "locked") return planId;
  for (const [name] of people) await c.mutation(api.votes.confirmAttendance, { userId: member(crewName, name), planId });
  const split = await c.query(api.funds.getPlanSplit, { planId });
  if (!split?.charged) {
    const charge = await c.mutation(api.cards.chargeCard, { userId: member(crewName, people[0][0]), groupId: crew(crewName)._id, planId });
    log(`${crewName}: card charged $${charge.amount} for ${charge.experience}`);
  }
  return planId;
}
await bookedOuting("Night Owls", [["Noah", 25], ["Chloe", 20]], "Demo: Friends concert outing", nextWeekday(5), 19);
await bookedOuting("Side Questers", [["Leo", 10], ["Sam", 10]], "Demo: Pizza study break", nextWeekday(4), 18);

// 7. Direct experience purchases through the mock Whop checkout.
async function purchase(crewName: string, userName: string, experienceTitle: string) {
  const userId = member(crewName, userName);
  const experienceId = exp(experienceTitle)._id;
  const mine = await c.query(api.purchases.getMyPurchase, { userId, experienceId });
  if (mine?.status === "completed") return;
  await mockPay(await c.action(api.experienceCheckout.createExperienceCheckout, { experienceId, userId, groupId: crew(crewName)._id }));
  log(`${userName} bought ${experienceTitle}`);
}
await purchase("Midnight Crew", "Maya", "Demo: Boba with friends");
await purchase("Boba Besties", "Priya", "Demo: Coffee and catch-up");
await purchase("Chalk Pals", "Ava", "Demo: Coffee and catch-up");
await purchase("Night Owls", "Noah", "Demo: Crew music night");

// 8. QR redemptions scanned by businesses and sponsors.
async function redeem(crewName: string, userName: string, kind: "offer" | "experience", refId: Id, scannerId: Id) {
  const listed = await c.query(api.redemptions.listRedemptions, { businessId: scannerId });
  if (listed.recent.some((r: any) => r.studentName === userName && r.kind === kind)) return;
  const issued = await c.mutation(api.redemptions.createRedemptionCode, { userId: member(crewName, userName), kind, refId });
  const result = await c.mutation(api.redemptions.redeemCode, { code: issued.code, businessId: scannerId });
  log(`${userName} redeemed ${issued.itemTitle} at ${issued.businessName}: ${result.valid ? "ok" : result.reason}`);
}
await redeem("Midnight Crew", "Maya", "experience", exp("Demo: Boba with friends")._id, businessId("Teaspoon - Palo Alto"));
await redeem("Boba Besties", "Priya", "experience", exp("Demo: Coffee and catch-up")._id, businessId("Coupa Cafe - Ramona"));
await redeem("Night Owls", "Noah", "experience", exp("Demo: Friends concert outing")._id, businessId("The Guild Theatre"));
for (const [crewName, name, business] of [
  ["Midnight Crew", "Maya", "Teaspoon - Palo Alto"],
  ["Boba Besties", "Priya", "Teaspoon - Palo Alto"],
  ["Side Questers", "Leo", "Coupa Cafe - Ramona"],
  ["Side Questers", "Sam", "Coupa Cafe - Ramona"],
  ["Night Owls", "Chloe", "The Guild Theatre"],
] as const) {
  await redeem(crewName, name, "offer", sponsor(business)._id, sponsor(business)._id);
}

// 9. Uma unlocks one sponsor reward with her diamond, so she has a reward QR to show.
const uma = member("Hack Crew", "Uma");
if ((await c.query(api.sponsors.getMyRewards, { userId: uma })).length === 0) {
  const reward = await c.mutation(api.sponsors.redeemReward, { userId: uma, sponsorId: sponsor("Teaspoon - Palo Alto")._id });
  log(`Uma unlocked ${reward.business} reward ${reward.code}`);
}

// Summary
const ranks = await c.query(api.points.myRanks, { userId: uma });
const user = await c.query(api.users.getUser, { userId: uma });
const lockedHack = (await plansOf("Hack Crew")).find((p: any) => p.status === "locked");
const split = lockedHack ? await c.query(api.funds.getPlanSplit, { planId: lockedHack._id }) : null;
console.log(JSON.stringify({
  umaGojis: user?.points,
  ranks,
  crews: (await c.query(api.points.groupLeaderboard, { limit: 10 })).map((r: any) => `${r.name} (${r.school}) ${r.avgPoints}`),
  schools: await c.query(api.points.schoolLeaderboard, { limit: 5 }),
  hackVotePlan: hackVote,
  lockedSplit: split && { total: split.total, sponsorCredit: split.sponsorCredit, attendees: split.attendees.map((a: any) => `${a.name} bal ${a.balance} share ${a.share} short ${a.shortBy}`) },
  businesses: await Promise.all(
    redeemers.filter((r: any) => r.type === "business").map(async (r: any) => {
      const s = await c.query(api.businesses.businessStats, { businessId: r.id });
      const red = await c.query(api.redemptions.listRedemptions, { businessId: r.id });
      return `${r.name}: ${s.bookings} bookings, $${s.earned} earned, ${red.total} redemptions`;
    }),
  ),
}, null, 2));
