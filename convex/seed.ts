import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { priceRange } from "./pricing";
import { travelEstimate } from "./places";

type PlaceSeed = {
  name: string;
  area: string;
  category: "food" | "bar" | "activity" | "outdoors" | "arts";
  priceLevel: number;
  tags: string[];
  lat: number;
  lng: number;
  durationMins: number;
  bookingUrl?: string;
};

const PLACES: PlaceSeed[] = [
  { name: "Tartine Bakery", area: "Mission", category: "food", priceLevel: 1, tags: ["cozy", "bakery", "brunch", "classic"], lat: 37.7614, lng: -122.4241, durationMins: 45, bookingUrl: "https://tartinebakery.com" },
  { name: "La Taqueria", area: "Mission", category: "food", priceLevel: 1, tags: ["casual", "tacos", "classic", "cheap-eats"], lat: 37.7509, lng: -122.4181, durationMins: 45 },
  { name: "Foreign Cinema", area: "Mission", category: "food", priceLevel: 3, tags: ["date-night", "film", "outdoors", "upscale"], lat: 37.7564, lng: -122.4193, durationMins: 120, bookingUrl: "https://foreigncinema.com" },
  { name: "Zuni Café", area: "Hayes Valley", category: "food", priceLevel: 3, tags: ["classic", "cozy", "upscale"], lat: 37.7736, lng: -122.4216, durationMins: 90, bookingUrl: "https://zunicafe.com" },
  { name: "Souvla", area: "Hayes Valley", category: "food", priceLevel: 2, tags: ["casual", "healthy", "quick", "vegetarian-friendly"], lat: 37.7765, lng: -122.4244, durationMins: 45 },
  { name: "Burma Superstar", area: "Inner Richmond", category: "food", priceLevel: 2, tags: ["flavorful", "group-friendly", "vegetarian-friendly"], lat: 37.783, lng: -122.4627, durationMins: 75 },
  { name: "House of Prime Rib", area: "Nob Hill", category: "food", priceLevel: 4, tags: ["classic", "fancy", "celebration"], lat: 37.7934, lng: -122.4226, durationMins: 120, bookingUrl: "https://houseofprimerib.net" },
  { name: "Mister Jiu's", area: "Chinatown", category: "food", priceLevel: 3, tags: ["upscale", "group-friendly", "date-night"], lat: 37.7936, lng: -122.4064, durationMins: 105, bookingUrl: "https://misterjius.com" },
  { name: "Dumpling Home", area: "Hayes Valley", category: "food", priceLevel: 2, tags: ["casual", "dumplings", "group-friendly", "cozy"], lat: 37.7746, lng: -122.4228, durationMins: 60 },
  { name: "Zeitgeist", area: "Mission", category: "bar", priceLevel: 1, tags: ["outdoors", "beer-garden", "casual", "lively"], lat: 37.7701, lng: -122.4222, durationMins: 90 },
  { name: "Trick Dog", area: "Mission", category: "bar", priceLevel: 2, tags: ["cocktails", "creative", "lively"], lat: 37.7591, lng: -122.4113, durationMins: 90 },
  { name: "El Techo", area: "Mission", category: "bar", priceLevel: 2, tags: ["rooftop", "lively", "cocktails", "views"], lat: 37.7566, lng: -122.4188, durationMins: 90 },
  { name: "The Interval at Long Now", area: "Marina", category: "bar", priceLevel: 2, tags: ["cozy", "nerdy", "cocktails", "quiet"], lat: 37.8065, lng: -122.4318, durationMins: 75 },
  { name: "Smuggler's Cove", area: "Hayes Valley", category: "bar", priceLevel: 2, tags: ["tiki", "cozy", "cocktails", "themed"], lat: 37.7794, lng: -122.4236, durationMins: 90 },
  { name: "Bourbon & Branch", area: "Tenderloin", category: "bar", priceLevel: 3, tags: ["speakeasy", "puzzle", "cozy", "date-night"], lat: 37.7869, lng: -122.413, durationMins: 90, bookingUrl: "https://bourbonandbranch.com" },
  { name: "Top of the Mark", area: "Nob Hill", category: "bar", priceLevel: 4, tags: ["rooftop", "views", "fancy"], lat: 37.792, lng: -122.4101, durationMins: 90 },
  { name: "Palace Games", area: "Marina", category: "activity", priceLevel: 3, tags: ["puzzle", "escape-room", "thrilling", "group-friendly"], lat: 37.8029, lng: -122.4484, durationMins: 90, bookingUrl: "https://palacegames.com" },
  { name: "Mission Bowling Club", area: "Mission", category: "activity", priceLevel: 2, tags: ["active", "games", "group-friendly", "lively"], lat: 37.7638, lng: -122.4176, durationMins: 90 },
  { name: "Musée Mécanique", area: "Fisherman's Wharf", category: "activity", priceLevel: 1, tags: ["quirky", "retro", "games", "cheap-eats"], lat: 37.8094, lng: -122.4159, durationMins: 60 },
  { name: "Dogpatch Boulders", area: "Dogpatch", category: "activity", priceLevel: 2, tags: ["active", "climbing", "social"], lat: 37.757, lng: -122.3881, durationMins: 120, bookingUrl: "https://touchstoneclimbing.com/dogpatch-boulders" },
  { name: "Urban Putt", area: "Mission", category: "activity", priceLevel: 2, tags: ["games", "quirky", "group-friendly", "lively"], lat: 37.754, lng: -122.4174, durationMins: 75, bookingUrl: "https://urbanputt.com" },
  { name: "Dolores Park", area: "Mission", category: "outdoors", priceLevel: 1, tags: ["outdoors", "picnic", "chill", "sunny"], lat: 37.7596, lng: -122.4269, durationMins: 120 },
  { name: "Lands End Trail", area: "Outer Richmond", category: "outdoors", priceLevel: 1, tags: ["active", "hiking", "views", "outdoors"], lat: 37.7799, lng: -122.5114, durationMins: 90 },
  { name: "Twin Peaks", area: "Twin Peaks", category: "outdoors", priceLevel: 1, tags: ["views", "sunset", "outdoors", "chill"], lat: 37.7544, lng: -122.4477, durationMins: 60 },
  { name: "Japanese Tea Garden", area: "Golden Gate Park", category: "outdoors", priceLevel: 1, tags: ["calm", "cozy", "outdoors", "tea"], lat: 37.7702, lng: -122.4703, durationMins: 60 },
  { name: "Crissy Field", area: "Presidio", category: "outdoors", priceLevel: 1, tags: ["active", "beach", "views", "picnic"], lat: 37.8039, lng: -122.4645, durationMins: 90 },
  { name: "SFMOMA", area: "SoMa", category: "arts", priceLevel: 2, tags: ["arts", "museum", "modern", "rainy-day"], lat: 37.7857, lng: -122.4011, durationMins: 120, bookingUrl: "https://www.sfmoma.org" },
  { name: "Exploratorium", area: "Embarcadero", category: "arts", priceLevel: 3, tags: ["nerdy", "interactive", "science", "group-friendly"], lat: 37.8017, lng: -122.3973, durationMins: 150, bookingUrl: "https://www.exploratorium.edu" },
  { name: "Castro Theatre", area: "Castro", category: "arts", priceLevel: 2, tags: ["film", "classic", "retro", "cozy"], lat: 37.762, lng: -122.4348, durationMins: 150, bookingUrl: "https://thecastro.com" },
  { name: "Sharon Art Studio", area: "Golden Gate Park", category: "arts", priceLevel: 2, tags: ["arts", "creative", "cozy", "hands-on"], lat: 37.7686, lng: -122.4573, durationMins: 120, bookingUrl: "https://www.sharonartstudio.org" },
  { name: "Pandora Karaoke", area: "Tenderloin", category: "activity", priceLevel: 1, tags: ["karaoke", "lively", "music", "late-night"], lat: 37.7841, lng: -122.4094, durationMins: 120 },
  { name: "City Kayak", area: "SoMa", category: "outdoors", priceLevel: 3, tags: ["active", "outdoors", "views", "sunset"], lat: 37.7787, lng: -122.3876, durationMins: 120, bookingUrl: "https://www.citykayak.com" },
  { name: "Dragon Gate", area: "Chinatown", category: "food", priceLevel: 1, tags: ["food", "walking", "classic", "group-friendly"], lat: 37.7908, lng: -122.4058, durationMins: 150 },
  { name: "Cobb's Comedy Club", area: "North Beach", category: "arts", priceLevel: 2, tags: ["comedy", "lively", "date-night"], lat: 37.8036, lng: -122.4136, durationMins: 120, bookingUrl: "https://www.cobbscomedy.com" },
];

const USERS = [
  { name: "Uma", avatarUrl: "🦊", budgetMax: 20, homeArea: "Mission", diet: ["vegetarian"], vibes: ["cozy", "outdoors", "arts"], points: 340, diamonds: 1, streak: 2 },
  { name: "Ishan", avatarUrl: "🐙", budgetMax: 30, homeArea: "Hayes Valley", diet: [], vibes: ["active", "games", "nerdy"], points: 420, diamonds: 1, streak: 1 },
  { name: "Gauri", avatarUrl: "🦄", budgetMax: 40, homeArea: "SoMa", diet: [], vibes: ["lively", "cocktails", "puzzle"], points: 480, diamonds: 2, streak: 3 },
];

const BUSINESSES: { name: string; experiences: { title: string; description: string; place: string; pricePerPerson: number; minGroup: number; maxGroup: number; tags: string[] }[] }[] = [
  {
    name: "Palace Games",
    experiences: [
      { title: "Private escape room for 4", description: "60 minutes, one locked room, and a game master cheering you on.", place: "Palace Games", pricePerPerson: 28, minGroup: 4, maxGroup: 8, tags: ["puzzle", "escape-room", "thrilling", "group-friendly"] },
      { title: "Houdini séance night", description: "A theatrical after-dark puzzle game inside the Palace of Fine Arts.", place: "Palace Games", pricePerPerson: 38, minGroup: 4, maxGroup: 6, tags: ["puzzle", "thrilling", "themed", "date-night"] },
    ],
  },
  {
    name: "SF Makers Collective",
    experiences: [
      { title: "Pottery night", description: "Throw your own mug on the wheel. Clay, glazing and firing included.", place: "Sharon Art Studio", pricePerPerson: 35, minGroup: 2, maxGroup: 8, tags: ["arts", "creative", "cozy", "hands-on"] },
      { title: "Private karaoke room", description: "Two hours in your own room with a song list of 50,000 tracks.", place: "Pandora Karaoke", pricePerPerson: 15, minGroup: 3, maxGroup: 10, tags: ["karaoke", "lively", "music", "group-friendly"] },
      { title: "Mini golf and a round", description: "18 SF-themed holes at Urban Putt, plus one drink each.", place: "Urban Putt", pricePerPerson: 22, minGroup: 2, maxGroup: 8, tags: ["games", "quirky", "lively", "group-friendly"] },
    ],
  },
  {
    name: "Bay Adventures",
    experiences: [
      { title: "Sunset kayak on the Bay", description: "A guided two-hour paddle past the Bay Bridge at golden hour.", place: "City Kayak", pricePerPerson: 40, minGroup: 2, maxGroup: 6, tags: ["active", "outdoors", "views", "sunset"] },
      { title: "Chinatown food tour", description: "Dumplings, egg tarts and fortune cookies on a guided walk.", place: "Dragon Gate", pricePerPerson: 25, minGroup: 2, maxGroup: 10, tags: ["food", "walking", "classic", "group-friendly"] },
    ],
  },
];

const SPONSORS = [
  { place: "El Techo", offer: "Free chips & guac with any round", rewardCost: 1, payPerVisit: 4 },
  { place: "Urban Putt", offer: "10% off a round of mini golf", rewardCost: 1, payPerVisit: 3 },
  { place: "Tartine Bakery", offer: "Free morning bun with any coffee", rewardCost: 1, payPerVisit: 2 },
];

// [winner, other options...], ratings per user in USERS order as [stars, vibe]
const PAST_PLANS: { daysAgo: number; places: string[]; why: string; ratings: [number, string][] }[] = [
  { daysAgo: 28, places: ["Palace Games", "Exploratorium", "Mission Bowling Club"], why: "A puzzle night for a crew that loves a challenge.", ratings: [[5, "thrilling"], [5, "genius"], [5, "thrilling"]] },
  { daysAgo: 21, places: ["Trick Dog", "Smuggler's Cove", "Zeitgeist"], why: "Creative cocktails within everyone's budget.", ratings: [[4, "lively"], [4, "fun"], [5, "lively"]] },
  { daysAgo: 14, places: ["Dolores Park", "Twin Peaks", "Crissy Field"], why: "Sunny afternoon picnic, free for everyone.", ratings: [[5, "chill"], [4, "sunny"], [4, "chill"]] },
  { daysAgo: 7, places: ["Musée Mécanique", "Urban Putt", "Castro Theatre"], why: "Retro arcade games for a quirky night.", ratings: [[2, "meh"], [2, "crowded"], [1, "boring"]] },
];

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("places").first()) {
      throw new Error("Demo data already exists. Run demo:resetDemo first, then seed again.");
    }

    const placeIds = new Map<string, Id<"places">>();
    for (const place of PLACES) placeIds.set(place.name, await ctx.db.insert("places", place));
    const placeByName = (name: string) => PLACES.find((p) => p.name === name)!;

    const now = Date.now();
    const userIds: Id<"users">[] = [];
    for (const [i, user] of USERS.entries()) {
      const busyBlocks = [1, 2, 3].map((d) => ({
        start: now + d * DAY + (i + 1) * 2 * HOUR,
        end: now + d * DAY + (i + 1) * 2 * HOUR + 2 * HOUR,
      }));
      userIds.push(await ctx.db.insert("users", { ...user, onboarded: true, busyBlocks }));
    }

    const groupId = await ctx.db.insert("groups", {
      name: "Hack Crew",
      inviteCode: "HACK42",
      ownerId: userIds[1],
      memberIds: userIds,
    });

    await ctx.db.insert("pots", { groupId, balance: 0, monthlyContribution: 20 });
    await ctx.runMutation(internal.cards.issueCard, { groupId });

    const businessIds: Id<"businesses">[] = [];
    for (const business of BUSINESSES) {
      const businessId = await ctx.db.insert("businesses", { name: business.name, earned: 0 });
      businessIds.push(businessId);
      for (const { place, ...experience } of business.experiences) {
        await ctx.db.insert("experiences", { ...experience, businessId, placeId: placeIds.get(place)!, active: true });
      }
    }

    const sponsorIds: Id<"sponsors">[] = [];
    for (const [i, s] of SPONSORS.entries()) {
      const place = placeByName(s.place);
      const sponsorId = await ctx.db.insert("sponsors", {
        business: place.name,
        offer: s.offer,
        placeId: placeIds.get(place.name)!,
        priceLevel: place.priceLevel,
        tags: place.tags,
        rewardCost: s.rewardCost,
        payPerVisit: s.payPerVisit,
        active: true,
      });
      sponsorIds.push(sponsorId);
      for (const [u, userId] of userIds.entries()) {
        await ctx.db.insert("rewards", { sponsorId, userId, code: `SQ-${place.name.replace(/[^A-Z]/gi, "").slice(0, 6).toUpperCase()}-${i}${u}` });
      }
    }

    const ratingIds: Id<"ratings">[] = [];
    for (const past of PAST_PLANS) {
      const start = now - past.daysAgo * DAY;
      const planId = await ctx.db.insert("plans", {
        groupId,
        window: { start, end: start + 3 * HOUR },
        status: "done",
        options: past.places.map((name, i) => {
          const place = placeByName(name);
          const { min, max } = priceRange(place.priceLevel);
          return {
            placeId: placeIds.get(name)!,
            title: name,
            costMin: min,
            costMax: max,
            why: i === 0 ? past.why : "Matches your crew's vibe.",
            travel: travelEstimate("Mission", place),
          };
        }),
        winningIndex: 0,
        confirmBy: start - DAY,
      });
      for (const [u, userId] of userIds.entries()) {
        await ctx.db.insert("votes", { planId, userId, optionIndex: 0, confirmed: true });
        const [stars, vibe] = past.ratings[u];
        ratingIds.push(await ctx.db.insert("ratings", { userId, planId, stars, vibe }));
      }
    }

    for (const userId of userIds) {
      await ctx.scheduler.runAfter(0, internal.memory.rememberPreferences, { userId });
    }
    for (const ratingId of ratingIds) {
      await ctx.scheduler.runAfter(0, internal.memory.rememberRating, { ratingId });
    }

    return { userIds, groupId, sponsorIds, businessIds, inviteCode: "HACK42", places: PLACES.length };
  },
});
