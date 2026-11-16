import { v } from "convex/values";
import { internalAction, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

// Additive, idempotent "lived-in" demo history. Re-running inserts nothing twice; demoSet:undo removes only what this file tagged.
// Tags: plans have window.start ending in MARK_MS, places carry MARK in bookingUrl, redemption tokens and purchase
// whopPaymentIds start with MARK. Every outing predates the pinned leaderboard week and no pointEvents are written,
// so leaderboard totals, Goji balances, pots and cards stay exactly as they are.

const MARK = "gojiberri-demo-set";
const MARK_MS = 417;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LEADERBOARD_WEEK_START = Date.parse("2026-11-09T08:00:00Z");

const at = (iso: string) => Date.parse(iso) + MARK_MS;
const isMarkedPlace = (p: Doc<"places">) => !!p.bookingUrl?.includes(MARK);
const nameKey = (name: string) => name.trim().toLowerCase();
const tagged = (key: string) => MARK + ":" + key;
const TAG_START = MARK + ":";
const TAG_END = MARK + ";";

const PLACES = [
  { name: "The Stanford Theatre", category: "arts", priceLevel: 1, tags: ["film", "classic", "rainy-day", "date-night"], lat: 37.4485, lng: -122.1607, durationMins: 150, bookingUrl: "https://stanfordtheatre.org/" },
  { name: "Tin Pot Creamery", category: "food", priceLevel: 1, tags: ["ice-cream", "dessert", "sweet", "study-break"], lat: 37.4386, lng: -122.1597, durationMins: 30, bookingUrl: "https://www.tinpotcreamery.com/" },
  { name: "Philz Coffee - Forest Ave", category: "food", priceLevel: 1, tags: ["coffee", "study-spot", "quick"], lat: 37.4426, lng: -122.1637, durationMins: 45, bookingUrl: "https://philzcoffee.com/" },
  { name: "Oren's Hummus - University Ave", category: "food", priceLevel: 2, tags: ["mediterranean", "vegetarian-friendly", "group-friendly"], lat: 37.4477, lng: -122.1597, durationMins: 60, bookingUrl: "https://www.orenshummus.com/" },
];

// Experiences start inactive: For You shows the 3 cheapest matching experiences, and these would push out the Guild cards.
const BUSINESSES = [
  { name: "The Stanford Theatre", place: "The Stanford Theatre", experience: { title: "Classic movie night", description: "A double feature at the 1925 movie palace on University Avenue, Wurlitzer organ included. $10 a person for crews of 2 to 8.", pricePerPerson: 10, minGroup: 2, maxGroup: 8, tags: ["film", "classic", "group-friendly"] }, offer: "Free popcorn for every crew of 3 or more.", payPerVisit: 3 },
  { name: "Tin Pot Creamery", place: "Tin Pot Creamery", experience: { title: "Crew scoop flight", description: "Four small-batch scoops each at Town & Country Village. Salted caramel is the move.", pricePerPerson: 8, minGroup: 2, maxGroup: 8, tags: ["ice-cream", "dessert", "group-friendly"] }, offer: "Extra scoop on us when the whole crew shows up.", payPerVisit: 2 },
  { name: "Philz Coffee - Forest Ave", place: "Philz Coffee - Forest Ave", experience: { title: "Study sesh coffee run", description: "Mint Mojitos for the study group at Philz on Forest Ave. $7 a person.", pricePerPerson: 7, minGroup: 2, maxGroup: 6, tags: ["coffee", "study-spot", "group-friendly"] }, offer: "$1 off any drink for Stanford crews.", payPerVisit: 2 },
  { name: "Oren's Hummus - University Ave", place: "Oren's Hummus - University Ave", experience: { title: "Mezze for the table", description: "Hummus, falafel and warm pita for the whole crew on University Avenue. $18 a person for groups of 3 to 8.", pricePerPerson: 18, minGroup: 3, maxGroup: 8, tags: ["mediterranean", "vegetarian-friendly", "group-friendly"] }, offer: "Free pita refills and a hummus upgrade for crews of 4+.", payPerVisit: 4 },
];

type Outing = {
  crew: string;
  start: number;
  place: string;
  alts: string[];
  why: string;
  cost: [number, number];
  sponsor?: string;
  experience?: string;
  ratings: [string, number, string][];
  photos: [string, string][];
};

const flickr = (path: string) => "https://live.staticflickr.com/" + path + "_b.jpg";

// Photos: CC-licensed Flickr shots of the real places (or the food), one per member who posted.
const OUTINGS: Outing[] = [
  {
    crew: "Hack Crew", start: at("2026-09-26T16:00:00Z"), place: "Stanford Dish - Stanford Avenue Trailhead", alts: ["Arizona Garden", "Rodin Sculpture Garden"],
    why: "A free loop around the Dish before midterms hit.", cost: [0, 0],
    ratings: [["Uma", 5, "would-redo"], ["Ishan", 4, "thrilling"], ["Gauri", 5, "chill"]],
    photos: [["Uma", flickr("65535/52129190503_580fec1c35")], ["Ishan", flickr("65535/52129159936_d3a7aa2ddd")], ["Gauri", flickr("65535/49726472862_7d797d9818")]],
  },
  {
    crew: "Hack Crew", start: at("2026-10-03T21:00:00Z"), place: "Cantor Arts Center", alts: ["Anderson Collection", "Kepler's Books"],
    why: "Free art on campus for an arts-loving crew.", cost: [0, 0],
    ratings: [["Uma", 5, "would-redo"], ["Ishan", 3, "chill"], ["Gauri", 4, "cozy"]],
    photos: [["Gauri", flickr("8393/8645421171_4deabb77a7")], ["Uma", flickr("4017/4416167732_7a0a5621ef")], ["Ishan", flickr("2447/4018394228_678548ea84")]],
  },
  {
    crew: "Hack Crew", start: at("2026-10-11T02:30:00Z"), place: "The Stanford Theatre", alts: ["Kepler's Books", "Coupa Cafe - Ramona"],
    why: "A classic double feature on University Ave for $10.", cost: [10, 10], sponsor: "The Stanford Theatre", experience: "Classic movie night",
    ratings: [["Uma", 5, "cozy"], ["Ishan", 5, "would-redo"], ["Gauri", 4, "cozy"]],
    photos: [["Ishan", flickr("3158/2771064789_0fa8082a15")], ["Uma", flickr("3279/2771907764_a364322183")], ["Gauri", flickr("3286/2771062097_198be1ac0b")]],
  },
  {
    crew: "Hack Crew", start: at("2026-10-31T03:00:00Z"), place: "Tin Pot Creamery", alts: ["Teaspoon - Palo Alto", "Pizza My Heart - Palo Alto"],
    why: "Ice cream after the hackathon kickoff.", cost: [6, 9], sponsor: "Tin Pot Creamery",
    ratings: [["Uma", 5, "would-redo"], ["Ishan", 4, "chaotic"], ["Gauri", 5, "would-redo"]],
    photos: [["Uma", flickr("3430/3269779650_5c18af4046")], ["Gauri", flickr("4030/5076899310_67b9566ac8")], ["Ishan", flickr("3399/3238215545_3dbd507e15")]],
  },
  {
    crew: "Midnight Crew", start: at("2026-10-17T18:00:00Z"), place: "Philz Coffee - Forest Ave", alts: ["Coupa Cafe - Ramona", "Teaspoon - Palo Alto"],
    why: "Coffee before a long study day.", cost: [5, 8], sponsor: "Philz Coffee - Forest Ave",
    ratings: [["Maya", 4, "cozy"], ["Leo", 5, "would-redo"], ["Priya", 4, "chill"], ["Sam", 3, "chill"]],
    photos: [["Maya", flickr("1046/749496905_f01af9999d")], ["Leo", flickr("1195/5160786404_285dcd0350")], ["Priya", flickr("207/505089359_ed1ec2d6ea")]],
  },
  {
    crew: "Midnight Crew", start: at("2026-10-25T03:30:00Z"), place: "The Guild Theatre", alts: ["Pizza My Heart - Palo Alto", "Arizona Garden"],
    why: "Live music in Menlo Park for a crew that loves a loud night.", cost: [26, 26], sponsor: "The Guild Theatre", experience: "Crew music night",
    ratings: [["Maya", 5, "thrilling"], ["Leo", 4, "chaotic"], ["Priya", 5, "would-redo"], ["Sam", 5, "thrilling"]],
    photos: [["Maya", flickr("6090/6090918016_4fe478cdce")], ["Priya", flickr("3490/3734360895_9ca52b84a2")], ["Sam", flickr("2426/3583105294_53d974f444")]],
  },
  {
    crew: "Night Owls", start: at("2026-10-09T03:00:00Z"), place: "The Stanford Theatre", alts: ["The Guild Theatre", "Coupa Cafe - Ramona"],
    why: "A late classic film for two night owls.", cost: [10, 10], sponsor: "The Stanford Theatre", experience: "Classic movie night",
    ratings: [["Noah", 5, "cozy"], ["Chloe", 4, "would-redo"]],
    photos: [["Noah", flickr("3160/2771061609_6cfcc2e337")], ["Chloe", flickr("3275/2771911004_c82f0728c0")]],
  },
  {
    crew: "Night Owls", start: at("2026-10-31T19:00:00Z"), place: "Oren's Hummus - University Ave", alts: ["Pizza My Heart - Palo Alto", "Coupa Cafe - Ramona"],
    why: "A big mezze lunch downtown.", cost: [15, 20], sponsor: "Oren's Hummus - University Ave", experience: "Mezze for the table",
    ratings: [["Noah", 4, "chill"], ["Chloe", 5, "would-redo"]],
    photos: [["Chloe", flickr("3039/2608931237_96221bc78e")], ["Noah", flickr("2413/2515892292_c4b0066853")]],
  },
  {
    crew: "Side Questers", start: at("2026-10-04T16:00:00Z"), place: "Stanford Dish - Stanford Avenue Trailhead", alts: ["Arizona Garden", "Rodin Sculpture Garden"],
    why: "A Sunday morning hike with views of the whole bay.", cost: [0, 0],
    ratings: [["Leo", 4, "thrilling"], ["Sam", 5, "chill"]],
    photos: [["Sam", flickr("4109/5603650455_071e26d570")], ["Leo", flickr("2711/4280349726_698e058df1")]],
  },
  {
    crew: "Side Questers", start: at("2026-10-18T20:00:00Z"), place: "Philz Coffee - Forest Ave", alts: ["Coupa Cafe - Ramona", "Kepler's Books"],
    why: "A cheap coffee run between problem sets.", cost: [7, 7], sponsor: "Philz Coffee - Forest Ave", experience: "Study sesh coffee run",
    ratings: [["Leo", 4, "cozy"], ["Sam", 4, "would-redo"]],
    photos: [["Leo", flickr("8491/8301075175_a6e1825859")], ["Sam", flickr("2846/13441768455_0d45277f69")]],
  },
  {
    crew: "Boba Besties", start: at("2026-10-08T23:00:00Z"), place: "Teaspoon - Palo Alto", alts: ["Tin Pot Creamery", "Coupa Cafe - Ramona"],
    why: "Brown sugar boba after section.", cost: [6, 8], sponsor: "Teaspoon - Palo Alto",
    ratings: [["Priya", 5, "would-redo"], ["Sam", 4, "chill"]],
    photos: [["Priya", flickr("1370/626245963_45390ac8ea")], ["Sam", flickr("1396/1271433668_6d49ca4073")]],
  },
  {
    crew: "Boba Besties", start: at("2026-10-22T23:30:00Z"), place: "Tin Pot Creamery", alts: ["Teaspoon - Palo Alto", "Pizza My Heart - Palo Alto"],
    why: "A sweet stop at Town & Country.", cost: [8, 8], sponsor: "Tin Pot Creamery", experience: "Crew scoop flight",
    ratings: [["Priya", 5, "cozy"], ["Sam", 4, "would-redo"]],
    photos: [["Sam", flickr("22/31568035_69a2c4b70e")], ["Priya", flickr("4044/4503232741_bbe828e80b")]],
  },
];
const OUTING_STARTS = new Set(OUTINGS.map((o) => o.start));

// Sales and QR redemptions for business dashboards, by members outside Hack Crew so Uma's pages don't change.
const PURCHASES: { key: string; business: string; experience: string; crew: string; user: string; quantity: number; daysAgo: number }[] = [
  { key: "guild-1", business: "The Guild Theatre", experience: "Crew music night", crew: "Midnight Crew", user: "Maya", quantity: 4, daysAgo: 23 },
  { key: "guild-2", business: "The Guild Theatre", experience: "Crew music night", crew: "Night Owls", user: "Noah", quantity: 2, daysAgo: 12 },
  { key: "guild-3", business: "The Guild Theatre", experience: "Friends concert outing", crew: "Boba Besties", user: "Priya", quantity: 2, daysAgo: 9 },
  { key: "guild-4", business: "The Guild Theatre", experience: "Friends concert outing", crew: "Side Questers", user: "Leo", quantity: 2, daysAgo: 4 },
  { key: "theatre-1", business: "The Stanford Theatre", experience: "Classic movie night", crew: "Night Owls", user: "Noah", quantity: 2, daysAgo: 38 },
  { key: "theatre-2", business: "The Stanford Theatre", experience: "Classic movie night", crew: "Midnight Crew", user: "Leo", quantity: 4, daysAgo: 6 },
  { key: "tinpot-1", business: "Tin Pot Creamery", experience: "Crew scoop flight", crew: "Boba Besties", user: "Priya", quantity: 2, daysAgo: 24 },
  { key: "philz-1", business: "Philz Coffee - Forest Ave", experience: "Study sesh coffee run", crew: "Side Questers", user: "Sam", quantity: 2, daysAgo: 28 },
  { key: "orens-1", business: "Oren's Hummus - University Ave", experience: "Mezze for the table", crew: "Night Owls", user: "Chloe", quantity: 2, daysAgo: 15 },
];

// hoursAgo is relative to the run, so the business "today" counters show activity on demo day.
const REDEMPTIONS: { key: string; business: string; kind: "offer" | "experience"; experience?: string; crew: string; user: string; hoursAgo: number }[] = [
  { key: "guild-today-1", business: "The Guild Theatre", kind: "offer", crew: "Midnight Crew", user: "Maya", hoursAgo: 0.4 },
  { key: "guild-today-2", business: "The Guild Theatre", kind: "offer", crew: "Night Owls", user: "Noah", hoursAgo: 1.2 },
  { key: "guild-today-3", business: "The Guild Theatre", kind: "experience", experience: "Friends concert outing", crew: "Side Questers", user: "Leo", hoursAgo: 2.1 },
  { key: "guild-past-1", business: "The Guild Theatre", kind: "offer", crew: "Boba Besties", user: "Priya", hoursAgo: 30 },
  { key: "guild-past-2", business: "The Guild Theatre", kind: "experience", experience: "Crew music night", crew: "Night Owls", user: "Chloe", hoursAgo: 75 },
  { key: "guild-past-3", business: "The Guild Theatre", kind: "offer", crew: "Midnight Crew", user: "Sam", hoursAgo: 120 },
  { key: "theatre-today-1", business: "The Stanford Theatre", kind: "offer", crew: "Night Owls", user: "Chloe", hoursAgo: 0.8 },
  { key: "theatre-past-1", business: "The Stanford Theatre", kind: "experience", experience: "Classic movie night", crew: "Midnight Crew", user: "Leo", hoursAgo: 50 },
  { key: "tinpot-today-1", business: "Tin Pot Creamery", kind: "offer", crew: "Boba Besties", user: "Sam", hoursAgo: 0.6 },
  { key: "tinpot-past-1", business: "Tin Pot Creamery", kind: "offer", crew: "Midnight Crew", user: "Priya", hoursAgo: 28 },
  { key: "philz-today-1", business: "Philz Coffee - Forest Ave", kind: "offer", crew: "Side Questers", user: "Leo", hoursAgo: 1.5 },
  { key: "philz-past-1", business: "Philz Coffee - Forest Ave", kind: "offer", crew: "Midnight Crew", user: "Maya", hoursAgo: 52 },
  { key: "orens-today-1", business: "Oren's Hummus - University Ave", kind: "offer", crew: "Night Owls", user: "Noah", hoursAgo: 1 },
  { key: "orens-past-1", business: "Oren's Hummus - University Ave", kind: "experience", experience: "Mezze for the table", crew: "Night Owls", user: "Chloe", hoursAgo: 96 },
];

async function crewByName(ctx: MutationCtx) {
  const groups = await ctx.db.query("groups").take(1000);
  const crews = new Map<string, { group: Doc<"groups">; members: Map<string, Id<"users">> }>();
  for (const name of new Set(OUTINGS.map((o) => o.crew))) {
    const group = groups.find((g) => g.name === name);
    if (!group) continue;
    const members = new Map<string, Id<"users">>();
    for (const id of group.memberIds) {
      const user = await ctx.db.get("users", id);
      if (user) members.set(user.name, id);
    }
    crews.set(name, { group, members });
  }
  return crews;
}

export const insertCore = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const inserted = { places: 0, businesses: 0, experiences: 0, sponsors: 0, plans: 0, votes: 0, ratings: 0, purchases: 0, redemptions: 0 };
    const skipped: string[] = [];

    const placeId = new Map((await ctx.db.query("places").take(2000)).map((p) => [p.name, p._id]));
    for (const place of PLACES) {
      if (placeId.has(place.name)) continue;
      placeId.set(place.name, await ctx.db.insert("places", { ...place, area: "Stanford", bookingUrl: place.bookingUrl + "?ref=" + MARK }));
      inserted.places++;
    }

    const businessByName = new Map((await ctx.db.query("businesses").take(500)).map((b) => [nameKey(b.name), b]));
    const sponsorByName = new Map((await ctx.db.query("sponsors").take(500)).map((s) => [nameKey(s.business), s]));
    for (const b of BUSINESSES) {
      let business = businessByName.get(nameKey(b.name));
      if (!business) {
        business = (await ctx.db.get("businesses", await ctx.db.insert("businesses", { name: b.name, earned: 0 })))!;
        businessByName.set(nameKey(b.name), business);
        inserted.businesses++;
      }
      const businessId = business._id;
      const pid = placeId.get(b.place)!;
      const experiences = await ctx.db.query("experiences").withIndex("by_business", (q) => q.eq("businessId", businessId)).take(100);
      if (!experiences.some((e) => e.title === b.experience.title)) {
        await ctx.db.insert("experiences", { ...b.experience, businessId, placeId: pid, active: false });
        inserted.experiences++;
      }
      if (!sponsorByName.has(nameKey(b.name))) {
        const place = PLACES.find((p) => p.name === b.place)!;
        const id = await ctx.db.insert("sponsors", {
          business: b.name, offer: b.offer, placeId: pid, priceLevel: place.priceLevel, tags: place.tags,
          rewardCost: 1, payPerVisit: b.payPerVisit, active: true,
        });
        sponsorByName.set(nameKey(b.name), (await ctx.db.get("sponsors", id))!);
        inserted.sponsors++;
      }
    }

    const experienceFor = async (businessName: string, title: string) => {
      const business = businessByName.get(nameKey(businessName));
      if (!business) return undefined;
      const rows = await ctx.db.query("experiences").withIndex("by_business", (q) => q.eq("businessId", business._id)).take(100);
      return rows.find((e) => e.title === title);
    };

    const crews = await crewByName(ctx);
    const pendingPhotos: { planId: Id<"plans">; groupId: Id<"groups">; userId: Id<"users">; slot: number; url: string }[] = [];
    for (const outing of OUTINGS) {
      if (outing.start >= LEADERBOARD_WEEK_START) throw new Error("Demo outings must predate the leaderboard week");
      const crew = crews.get(outing.crew);
      if (!crew || !placeId.has(outing.place)) {
        skipped.push("outing " + outing.crew + " at " + outing.place);
        continue;
      }
      const groupId = crew.group._id;
      const existing = (await ctx.db.query("plans").withIndex("by_group", (q) => q.eq("groupId", groupId)).take(500)).find(
        (p) => p.window.start === outing.start,
      );
      let planId = existing?._id;
      if (!planId) {
        const sponsorId = outing.sponsor ? sponsorByName.get(nameKey(outing.sponsor))?._id : undefined;
        const experienceId = outing.experience && outing.sponsor ? (await experienceFor(outing.sponsor, outing.experience))?._id : undefined;
        const options = [outing.place, ...outing.alts].flatMap((name, i) => {
          const pid = placeId.get(name);
          if (!pid) return [];
          const winner = i === 0;
          return [{
            placeId: pid,
            title: winner && experienceId ? outing.experience! : name,
            costMin: winner ? outing.cost[0] : 0,
            costMax: winner ? outing.cost[1] : 15,
            why: winner ? outing.why : "Matches your crew's vibe.",
            travel: "10 min by bike",
            ...(winner ? { experienceId, sponsorId } : {}),
          }];
        });
        planId = await ctx.db.insert("plans", {
          groupId,
          window: { start: outing.start, end: outing.start + 3 * HOUR },
          status: "done",
          options,
          winningIndex: 0,
          confirmBy: outing.start - DAY,
        });
        inserted.plans++;
        for (const userId of crew.group.memberIds) {
          await ctx.db.insert("votes", { planId, userId, optionIndex: 0, confirmed: true });
          inserted.votes++;
        }
        for (const [name, stars, vibe] of outing.ratings) {
          const userId = crew.members.get(name);
          if (!userId) continue;
          await ctx.db.insert("ratings", { userId, planId, stars, vibe });
          inserted.ratings++;
        }
      }
      const id = planId;
      const have = (await ctx.db.query("photos").withIndex("by_plan", (q) => q.eq("planId", id)).take(100)).length;
      outing.photos.forEach(([name, url], slot) => {
        const userId = crew.members.get(name);
        if (slot >= have && userId) pendingPhotos.push({ planId: id, groupId, userId, slot, url });
      });
    }

    for (const p of PURCHASES) {
      const whopPaymentId = tagged(p.key);
      if (await ctx.db.query("experiencePurchases").withIndex("by_payment", (q) => q.eq("whopPaymentId", whopPaymentId)).first()) continue;
      const crew = crews.get(p.crew);
      const userId = crew?.members.get(p.user);
      const experience = await experienceFor(p.business, p.experience);
      const business = businessByName.get(nameKey(p.business));
      if (!crew || !userId || !experience || !business) {
        skipped.push("purchase " + p.key);
        continue;
      }
      const amount = experience.pricePerPerson * p.quantity;
      await ctx.db.insert("experiencePurchases", {
        userId, experienceId: experience._id, businessId: business._id, groupId: crew.group._id,
        quantity: p.quantity, amount, currency: "usd", status: "completed", whopPaymentId, completedAt: now - p.daysAgo * DAY,
      });
      const fresh = (await ctx.db.get("businesses", business._id))!;
      await ctx.db.patch("businesses", business._id, { earned: fresh.earned + amount });
      inserted.purchases++;
    }

    for (const r of REDEMPTIONS) {
      const token = tagged(r.key);
      if (await ctx.db.query("redemptions").withIndex("by_token", (q) => q.eq("token", token)).first()) continue;
      const userId = crews.get(r.crew)?.members.get(r.user);
      const business = businessByName.get(nameKey(r.business));
      const sponsor = sponsorByName.get(nameKey(r.business));
      const experience = r.experience ? await experienceFor(r.business, r.experience) : undefined;
      const refId = r.kind === "offer" ? sponsor?._id : experience?._id;
      if (!userId || !refId) {
        skipped.push("redemption " + r.key);
        continue;
      }
      const redeemedAt = Math.round(now - r.hoursAgo * HOUR);
      await ctx.db.insert("redemptions", {
        token, kind: r.kind, refId, userId, businessId: business?._id, sponsorId: r.kind === "offer" ? sponsor?._id : undefined,
        status: "redeemed", expiresAt: redeemedAt + 10 * 60 * 1000, redeemedAt,
      });
      inserted.redemptions++;
    }

    return { inserted, skipped, pendingPhotos };
  },
});

export const insertPhoto = internalMutation({
  args: { planId: v.id("plans"), groupId: v.id("groups"), userId: v.id("users"), slot: v.number(), storageId: v.id("_storage") },
  handler: async (ctx, { planId, groupId, userId, slot, storageId }) => {
    const plan = await ctx.db.get("plans", planId);
    const have = (await ctx.db.query("photos").withIndex("by_plan", (q) => q.eq("planId", planId)).take(100)).length;
    if (!plan || !OUTING_STARTS.has(plan.window.start) || have > slot) return { photo: false, visit: false };
    const photoId = await ctx.db.insert("photos", { userId, groupId, planId, storageId, verifyStatus: "verified" });
    const sponsorId = plan.winningIndex !== undefined ? plan.options[plan.winningIndex]?.sponsorId : undefined;
    const sponsor = sponsorId ? await ctx.db.get("sponsors", sponsorId) : null;
    if (sponsor) await ctx.db.insert("visits", { sponsorId: sponsor._id, userId, photoId, amount: sponsor.payPerVisit });
    return { photo: true, visit: !!sponsor };
  },
});

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ inserted: Record<string, number>; skipped: string[]; photosFailed: string[] }> => {
    const { inserted, skipped, pendingPhotos } = await ctx.runMutation(internal.demoSet.insertCore, {});
    let photos = 0;
    let visits = 0;
    const photosFailed: string[] = [];
    for (const { url, ...photo } of pendingPhotos) {
      let storageId: Id<"_storage"> | null = null;
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Gojiberri demo set (hackathon)" } });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.startsWith("image/")) throw new Error(res.status + " " + type);
        storageId = await ctx.storage.store(await res.blob());
        const result = await ctx.runMutation(internal.demoSet.insertPhoto, { ...photo, storageId });
        if (!result.photo) await ctx.storage.delete(storageId);
        photos += Number(result.photo);
        visits += Number(result.visit);
      } catch (err) {
        if (storageId) await ctx.storage.delete(storageId);
        photosFailed.push(url + ": " + (err instanceof Error ? err.message : String(err)));
      }
    }
    return { inserted: { ...inserted, photos, visits }, skipped, photosFailed };
  },
});

export const undo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const removed = { plans: 0, votes: 0, ratings: 0, photos: 0, visits: 0, purchases: 0, redemptions: 0, sponsors: 0, experiences: 0, businesses: 0, places: 0 };
    const kept: string[] = [];

    const plans: Doc<"plans">[] = [];
    for (const { group } of (await crewByName(ctx)).values()) {
      const all = await ctx.db.query("plans").withIndex("by_group", (q) => q.eq("groupId", group._id)).take(500);
      plans.push(...all.filter((p) => OUTING_STARTS.has(p.window.start)));
    }
    const planIds = new Set(plans.map((p) => p._id));
    const visits = await ctx.db.query("visits").take(10000);
    for (const plan of plans) {
      for (const vote of await ctx.db.query("votes").withIndex("by_plan", (q) => q.eq("planId", plan._id)).take(500)) {
        await ctx.db.delete("votes", vote._id);
        removed.votes++;
      }
      for (const rating of await ctx.db.query("ratings").withIndex("by_plan", (q) => q.eq("planId", plan._id)).take(500)) {
        await ctx.db.delete("ratings", rating._id);
        removed.ratings++;
      }
      for (const photo of await ctx.db.query("photos").withIndex("by_plan", (q) => q.eq("planId", plan._id)).take(500)) {
        for (const visit of visits.filter((x) => x.photoId === photo._id)) {
          await ctx.db.delete("visits", visit._id);
          removed.visits++;
        }
        await ctx.storage.delete(photo.storageId);
        await ctx.db.delete("photos", photo._id);
        removed.photos++;
      }
      await ctx.db.delete("plans", plan._id);
      removed.plans++;
    }

    for await (const r of ctx.db.query("redemptions").withIndex("by_token", (q) => q.gte("token", TAG_START).lt("token", TAG_END))) {
      await ctx.db.delete("redemptions", r._id);
      removed.redemptions++;
    }
    for await (const p of ctx.db.query("experiencePurchases").withIndex("by_payment", (q) => q.gte("whopPaymentId", TAG_START).lt("whopPaymentId", TAG_END))) {
      const business = await ctx.db.get("businesses", p.businessId);
      if (business) await ctx.db.patch("businesses", business._id, { earned: Math.max(0, business.earned - p.amount) });
      await ctx.db.delete("experiencePurchases", p._id);
      removed.purchases++;
    }

    const referenced = new Set<Id<"places">>();
    for await (const plan of ctx.db.query("plans")) {
      if (planIds.has(plan._id)) continue;
      for (const o of plan.options) referenced.add(o.placeId);
    }
    const sponsors = await ctx.db.query("sponsors").take(500);
    const businesses = await ctx.db.query("businesses").take(500);
    for (const place of (await ctx.db.query("places").take(2000)).filter(isMarkedPlace)) {
      if (referenced.has(place._id)) {
        kept.push(place.name);
        continue;
      }
      for (const s of sponsors.filter((s) => s.placeId === place._id)) {
        await ctx.db.delete("sponsors", s._id);
        removed.sponsors++;
      }
      const def = BUSINESSES.find((b) => b.place === place.name);
      const business = def && businesses.find((b) => nameKey(b.name) === nameKey(def.name));
      if (business) {
        const experiences = await ctx.db.query("experiences").withIndex("by_business", (q) => q.eq("businessId", business._id)).take(100);
        const ours = experiences.filter((e) => e.placeId === place._id);
        for (const e of ours) {
          await ctx.db.delete("experiences", e._id);
          removed.experiences++;
        }
        if (ours.length === experiences.length) {
          await ctx.db.delete("businesses", business._id);
          removed.businesses++;
        }
      }
      await ctx.db.delete("places", place._id);
      removed.places++;
    }
    return { removed, kept };
  },
});
