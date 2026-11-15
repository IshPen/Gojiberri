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

// area is the nearby school, matching users.homeArea, so listCandidates' by_area lookup finds campus spots.
const PLACES: PlaceSeed[] = [
  { name: "Coupa Cafe - Ramona", area: "Stanford", category: "food", priceLevel: 1, tags: ["coffee", "cozy", "study-spot"], lat: 37.4447235, lng: -122.1614973, durationMins: 45, bookingUrl: "https://www.coupacafe.com/Locations/palo-alto-ramona" },
  { name: "Pizza My Heart - Palo Alto", area: "Stanford", category: "food", priceLevel: 1, tags: ["pizza", "cheap-eats", "vegetarian-friendly", "group-friendly"], lat: 37.444896, lng: -122.162402, durationMins: 45, bookingUrl: "https://www.pizzamyheart.com/location/-pizza-my-heart-palo-alto/" },
  { name: "Teaspoon - Palo Alto", area: "Stanford", category: "food", priceLevel: 1, tags: ["boba", "dessert", "study-break"], lat: 37.4340878, lng: -122.1294905, durationMins: 30, bookingUrl: "https://www.teaspoonlife.com/" },
  { name: "Kepler's Books", area: "Stanford", category: "arts", priceLevel: 1, tags: ["books", "browsing", "nerdy", "cozy"], lat: 37.4536482, lng: -122.181922, durationMins: 60, bookingUrl: "https://keplers.com/contact" },
  { name: "The Guild Theatre", area: "Stanford", category: "arts", priceLevel: 2, tags: ["live-music", "concerts", "lively"], lat: 37.452528, lng: -122.1812233, durationMins: 150, bookingUrl: "https://www.guildtheatre.com/calendar" },
  { name: "Cantor Arts Center", area: "Stanford", category: "arts", priceLevel: 1, tags: ["museum", "art", "free", "rainy-day"], lat: 37.4329821, lng: -122.170844, durationMins: 90, bookingUrl: "https://museum.stanford.edu/visit" },
  { name: "Anderson Collection", area: "Stanford", category: "arts", priceLevel: 1, tags: ["museum", "art", "free", "rainy-day"], lat: 37.433649, lng: -122.170603, durationMins: 60, bookingUrl: "https://anderson.stanford.edu/visit/" },
  { name: "Rodin Sculpture Garden", area: "Stanford", category: "outdoors", priceLevel: 1, tags: ["sculpture", "art", "chill", "free"], lat: 37.4323, lng: -122.1705, durationMins: 45, bookingUrl: "https://museum.stanford.edu/exhibitions/b-gerald-cantor-rodin-sculpture-garden" },
  { name: "Arizona Garden", area: "Stanford", category: "outdoors", priceLevel: 1, tags: ["garden", "walking", "chill", "free"], lat: 37.4359194, lng: -122.1711194, durationMins: 45, bookingUrl: "https://facops.stanford.edu/arizona-garden" },
  { name: "Stanford Dish - Stanford Avenue Trailhead", area: "Stanford", category: "outdoors", priceLevel: 1, tags: ["hiking", "views", "active", "free"], lat: 37.410221, lng: -122.161038, durationMins: 90, bookingUrl: "https://dish.stanford.edu/" },
  { name: "Asha Tea House", area: "Berkeley", category: "food", priceLevel: 1, tags: ["boba", "cozy", "study-spot", "cheap-eats"], lat: 37.872, lng: -122.2683, durationMins: 30 },
  { name: "Sharetea Berkeley", area: "Berkeley", category: "food", priceLevel: 1, tags: ["boba", "quick", "late-night"], lat: 37.8686, lng: -122.259, durationMins: 30 },
  { name: "Top Dog", area: "Berkeley", category: "food", priceLevel: 1, tags: ["cheap-eats", "late-night", "classic", "quick"], lat: 37.8679, lng: -122.2577, durationMins: 20 },
  { name: "Cheese Board Pizza", area: "Berkeley", category: "food", priceLevel: 1, tags: ["pizza", "vegetarian-friendly", "live-music", "classic"], lat: 37.8798, lng: -122.2694, durationMins: 45 },
  { name: "Gypsy's Trattoria Italiana", area: "Berkeley", category: "food", priceLevel: 1, tags: ["cheap-eats", "pasta", "group-friendly", "study-break"], lat: 37.8678, lng: -122.2583, durationMins: 45 },
  { name: "Yogurt Park", area: "Berkeley", category: "food", priceLevel: 1, tags: ["dessert", "late-night", "cheap-eats"], lat: 37.8681, lng: -122.26, durationMins: 20 },
  { name: "Free Speech Movement Café", area: "Berkeley", category: "food", priceLevel: 1, tags: ["coffee", "campus", "study-spot", "quick"], lat: 37.8726, lng: -122.2602, durationMins: 30 },
  { name: "Berkeley Bouldering Project", area: "Berkeley", category: "activity", priceLevel: 2, tags: ["climbing", "active", "social", "student-discount"], lat: 37.8551, lng: -122.2905, durationMins: 120, bookingUrl: "https://www.boulderingproject.com/berkeley" },
  { name: "Buffalo Exchange Berkeley", area: "Berkeley", category: "activity", priceLevel: 1, tags: ["thrift", "fashion", "browsing", "group-friendly"], lat: 37.8642, lng: -122.2586, durationMins: 60 },
  { name: "Amoeba Music Berkeley", area: "Berkeley", category: "arts", priceLevel: 1, tags: ["records", "music", "browsing", "retro"], lat: 37.866, lng: -122.2588, durationMins: 45 },
  { name: "Indian Rock Park", area: "Berkeley", category: "outdoors", priceLevel: 1, tags: ["sunset", "views", "bouldering", "chill", "free"], lat: 37.892, lng: -122.2723, durationMins: 60 },
  { name: "Big C Trail", area: "Berkeley", category: "outdoors", priceLevel: 1, tags: ["hiking", "views", "active", "free"], lat: 37.8754, lng: -122.2448, durationMins: 75 },
  { name: "Cesar Chavez Park", area: "Berkeley", category: "outdoors", priceLevel: 1, tags: ["picnic", "kites", "sunset", "free"], lat: 37.871, lng: -122.3195, durationMins: 90 },
  { name: "BAMPFA", area: "Berkeley", category: "arts", priceLevel: 1, tags: ["film", "museum", "student-free", "rainy-day"], lat: 37.8709, lng: -122.267, durationMins: 120, bookingUrl: "https://bampfa.org" },
  { name: "The UC Theatre", area: "Berkeley", category: "arts", priceLevel: 2, tags: ["live-music", "concerts", "lively"], lat: 37.8716, lng: -122.2702, durationMins: 150, bookingUrl: "https://www.theuctheatre.org" },
  { name: "Jupiter", area: "Berkeley", category: "bar", priceLevel: 2, tags: ["beer-garden", "pizza", "live-music", "21+"], lat: 37.8698, lng: -122.268, durationMins: 90 },
  { name: "Purple Kow", area: "USF", category: "food", priceLevel: 1, tags: ["boba", "late-night", "cheap-eats"], lat: 37.7759, lng: -122.496, durationMins: 30 },
  { name: "Genki Crepes", area: "USF", category: "food", priceLevel: 1, tags: ["crepes", "boba", "dessert", "quick"], lat: 37.783, lng: -122.4618, durationMins: 30 },
  { name: "The Little Chihuahua", area: "USF", category: "food", priceLevel: 1, tags: ["burritos", "cheap-eats", "vegetarian-friendly"], lat: 37.772, lng: -122.4372, durationMins: 40 },
  { name: "Burma Superstar", area: "USF", category: "food", priceLevel: 2, tags: ["flavorful", "group-friendly", "vegetarian-friendly"], lat: 37.783, lng: -122.4627, durationMins: 75 },
  { name: "Wasteland", area: "USF", category: "activity", priceLevel: 2, tags: ["thrift", "vintage", "fashion"], lat: 37.7697, lng: -122.4497, durationMins: 60 },
  { name: "Held Over", area: "USF", category: "activity", priceLevel: 1, tags: ["thrift", "vintage", "browsing"], lat: 37.7701, lng: -122.447, durationMins: 45 },
  { name: "Amoeba Music SF", area: "USF", category: "arts", priceLevel: 1, tags: ["records", "music", "free-shows", "browsing"], lat: 37.7692, lng: -122.4543, durationMins: 60 },
  { name: "Movement San Francisco", area: "USF", category: "activity", priceLevel: 2, tags: ["climbing", "active", "social", "student-discount"], lat: 37.804, lng: -122.466, durationMins: 120, bookingUrl: "https://movementgyms.com/san-francisco" },
  { name: "Pandora Karaoke", area: "USF", category: "activity", priceLevel: 1, tags: ["karaoke", "lively", "music", "late-night"], lat: 37.7841, lng: -122.4094, durationMins: 120 },
  { name: "The Mint Karaoke Lounge", area: "USF", category: "bar", priceLevel: 1, tags: ["karaoke", "lively", "late-night", "21+"], lat: 37.769, lng: -122.4267, durationMins: 120 },
  { name: "Stow Lake", area: "USF", category: "outdoors", priceLevel: 1, tags: ["paddle-boats", "picnic", "chill"], lat: 37.7699, lng: -122.4757, durationMins: 90 },
  { name: "Ocean Beach", area: "USF", category: "outdoors", priceLevel: 1, tags: ["beach", "bonfire", "sunset", "free"], lat: 37.7594, lng: -122.5107, durationMins: 120 },
  { name: "Alamo Square", area: "USF", category: "outdoors", priceLevel: 1, tags: ["picnic", "views", "chill", "free"], lat: 37.7763, lng: -122.4346, durationMins: 60 },
  { name: "Balboa Theatre", area: "USF", category: "arts", priceLevel: 1, tags: ["film", "indie", "retro", "cozy"], lat: 37.7757, lng: -122.497, durationMins: 150, bookingUrl: "https://www.balboamovies.com" },
];

const USERS = [
  { name: "Uma", avatarUrl: "🦊", budgetMax: 20, homeArea: "Stanford", diet: ["vegetarian"], vibes: ["cozy", "outdoors", "arts"], diamonds: 1, streak: 2 },
  { name: "Ishan", avatarUrl: "🐙", budgetMax: 20, homeArea: "Stanford", diet: [], vibes: ["active", "games", "nerdy"], diamonds: 1, streak: 1 },
  { name: "Gauri", avatarUrl: "🦄", budgetMax: 25, homeArea: "Stanford", diet: [], vibes: ["lively", "boba", "music"], diamonds: 1, streak: 3 },
  { name: "Maya", avatarUrl: "🐼", budgetMax: 20, homeArea: "Stanford", diet: [], vibes: ["lively", "music", "late-night"], diamonds: 1, streak: 4 },
  { name: "Leo", avatarUrl: "🦁", budgetMax: 15, homeArea: "Stanford", diet: [], vibes: ["nerdy", "cheap-eats", "games"], diamonds: 0, streak: 2 },
  { name: "Priya", avatarUrl: "🦋", budgetMax: 20, homeArea: "Stanford", diet: ["vegetarian"], vibes: ["boba", "cozy", "arts"], diamonds: 0, streak: 2 },
  { name: "Sam", avatarUrl: "🐢", budgetMax: 15, homeArea: "Stanford", diet: [], vibes: ["chill", "outdoors"], diamonds: 0, streak: 1 },
  { name: "Ava", avatarUrl: "🐨", budgetMax: 20, homeArea: "USF", diet: [], vibes: ["active", "climbing", "outdoors"], diamonds: 0, streak: 2 },
  { name: "Diego", avatarUrl: "🐯", budgetMax: 20, homeArea: "USF", diet: [], vibes: ["active", "thrift", "music"], diamonds: 0, streak: 1 },
  { name: "Kai", avatarUrl: "🐬", budgetMax: 15, homeArea: "USF", diet: ["vegan"], vibes: ["climbing", "chill", "beach"], diamonds: 0, streak: 1 },
  { name: "Noah", avatarUrl: "🦉", budgetMax: 25, homeArea: "Stanford", diet: [], vibes: ["late-night", "games", "nerdy"], diamonds: 1, streak: 3 },
  { name: "Chloe", avatarUrl: "🐝", budgetMax: 20, homeArea: "Stanford", diet: [], vibes: ["active", "climbing", "lively"], diamonds: 0, streak: 2 },
];

const CREWS: { name: string; inviteCode: string; members: string[] }[] = [
  { name: "Hack Crew", inviteCode: "GOJI42", members: ["Uma", "Ishan", "Gauri"] },
  { name: "Midnight Crew", inviteCode: "UNIT32", members: ["Maya", "Leo", "Priya", "Sam"] },
  { name: "Side Questers", inviteCode: "CS61BS", members: ["Leo", "Sam"] },
  { name: "Boba Besties", inviteCode: "BOBACL", members: ["Priya", "Sam"] },
  { name: "Chalk Pals", inviteCode: "USFCLB", members: ["Ava", "Diego", "Kai"] },
  { name: "Sunset Crew", inviteCode: "LONEMT", members: ["Ava", "Kai"] },
  { name: "Night Owls", inviteCode: "BRANNR", members: ["Noah", "Chloe"] },
  { name: "Boulder Buddies", inviteCode: "BOULDR", members: ["Kai", "Diego", "Chloe"] },
];

const BUSINESSES: { name: string; experiences: { title: string; description: string; place: string; pricePerPerson: number; minGroup: number; maxGroup: number; tags: string[] }[] }[] = [
  {
    name: "The Guild Theatre",
    experiences: [
      { title: "Demo: Crew music night", description: "Fictional demo package based on the real Guild Theatre in Menlo Park. The $26 price and group booking are not venue offers; check the venue calendar for actual tickets and age restrictions.", place: "The Guild Theatre", pricePerPerson: 26, minGroup: 2, maxGroup: 8, tags: ["live-music", "lively", "social", "group-friendly"] },
      { title: "Demo: Friends concert outing", description: "Fictional $20 demo package at the real Guild Theatre, not a student discount or a confirmed performance. Actual tickets, availability and age restrictions vary by show.", place: "The Guild Theatre", pricePerPerson: 20, minGroup: 2, maxGroup: 6, tags: ["live-music", "lively", "group-friendly"] },
    ],
  },
  {
    name: "Pizza My Heart - Palo Alto",
    experiences: [
      { title: "Demo: Pizza study break", description: "Fictional $9-per-person demo package based on the real Pizza My Heart at 220 University Avenue. Not a restaurant offer, reservation or guaranteed meal price.", place: "Pizza My Heart - Palo Alto", pricePerPerson: 9, minGroup: 2, maxGroup: 10, tags: ["pizza", "cheap-eats", "vegetarian-friendly", "group-friendly"] },
    ],
  },
  {
    name: "Teaspoon - Palo Alto",
    experiences: [
      { title: "Demo: Boba with friends", description: "Fictional $12 demo tasting package based on the real Teaspoon at 2675 Middlefield Road. Not a shop offer or reserved event; order real drinks from the shop's menu.", place: "Teaspoon - Palo Alto", pricePerPerson: 12, minGroup: 3, maxGroup: 10, tags: ["boba", "dessert", "social", "group-friendly"] },
    ],
  },
  {
    name: "Coupa Cafe - Ramona",
    experiences: [
      { title: "Demo: Coffee and catch-up", description: "Fictional $22 demo food-and-coffee package based on the real Coupa Cafe at 538 Ramona Street. Not a cafe offer, student discount or reservation.", place: "Coupa Cafe - Ramona", pricePerPerson: 22, minGroup: 2, maxGroup: 10, tags: ["coffee", "cozy", "social", "group-friendly"] },
    ],
  },
];

// Goji rewards: unlocked with diamonds earned from group outings.
const SPONSORS = [
  { place: "The Guild Theatre", offer: "Demo only: $10 into your crew's pot for music night. Fictional sponsorship, not a venue offer.", rewardCost: 1, payPerVisit: 5 },
  { place: "Teaspoon - Palo Alto", offer: "Demo only: free boba topping for Stanford friends. Fictional reward, not redeemable at the shop.", rewardCost: 1, payPerVisit: 2 },
  { place: "Coupa Cafe - Ramona", offer: "Demo only: two-for-one coffee for Stanford friends. Fictional reward, not redeemable at the cafe.", rewardCost: 1, payPerVisit: 2 },
];

// Hack Crew history: [winner, other options...], ratings per Hack Crew member as [stars, vibe].
// Ratings feed suggestions only; the seed awards no points for them.
const PAST_PLANS: { daysAgo: number; places: string[]; why: string; ratings: [number, string][] }[] = [
  { daysAgo: 28, places: ["Arizona Garden", "Stanford Dish - Stanford Avenue Trailhead", "Rodin Sculpture Garden"], why: "A free garden hang on campus.", ratings: [[5, "chill"], [4, "chill"], [5, "would-redo"]] },
  { daysAgo: 21, places: ["Pizza My Heart - Palo Alto", "Coupa Cafe - Ramona", "Teaspoon - Palo Alto"], why: "A casual food stop in Palo Alto.", ratings: [[5, "cozy"], [5, "would-redo"], [4, "cozy"]] },
  { daysAgo: 14, places: ["Kepler's Books", "Cantor Arts Center", "Anderson Collection"], why: "A rainy-day book browse in Menlo Park.", ratings: [[2, "meh"], [3, "meh"], [2, "crowded"]] },
  { daysAgo: 9, places: ["The Guild Theatre", "Arizona Garden", "Rodin Sculpture Garden"], why: "Live music in Menlo Park for a crew that loves a lively night.", ratings: [[4, "thrilling"], [5, "thrilling"], [5, "would-redo"]] },
];

// This week's completed outings per crew. Each name in checkedIn gets one +50 "checkin" pointEvent
// carrying the crew's groupId and the outing's planId, which is all #10's crew leaderboard counts.
// users.points is the sum of a user's check-ins.
//
// Weekly avg per member at Stanford (points.groupLeaderboard):
//   Midnight Crew    (4 members): 9 check-ins = 450 / 4 = 112.5  -> #1
//   Hack Crew         (3 members): 6 check-ins = 300 / 3 = 100    -> #2, 12.5 behind
//   Side Questers  (2 members): 100 / 2 = 50
//   Boba Besties (2 members): 50 / 2 = 25
// One +50 check-in by a Hack Crew member on its locked plan: 350 / 3 = 116.7 > 112.5, so Hack Crew takes #1.
// One check-in adds only 16.7 to a 3-member crew's avg, so a 20-point gap could never flip.
const CREW_OUTINGS: { crew: string; daysAgo: number; place: string; checkedIn: string[] }[] = [
  { crew: "Hack Crew", daysAgo: 3, place: "Teaspoon - Palo Alto", checkedIn: ["Uma", "Ishan", "Gauri"] },
  { crew: "Hack Crew", daysAgo: 1, place: "Pizza My Heart - Palo Alto", checkedIn: ["Uma", "Ishan", "Gauri"] },
  { crew: "Midnight Crew", daysAgo: 4, place: "Pizza My Heart - Palo Alto", checkedIn: ["Maya", "Leo", "Priya", "Sam"] },
  { crew: "Midnight Crew", daysAgo: 3, place: "Arizona Garden", checkedIn: ["Maya", "Leo", "Priya"] },
  { crew: "Midnight Crew", daysAgo: 1, place: "Teaspoon - Palo Alto", checkedIn: ["Maya", "Priya"] },
  { crew: "Side Questers", daysAgo: 2, place: "Coupa Cafe - Ramona", checkedIn: ["Leo", "Sam"] },
  { crew: "Boba Besties", daysAgo: 2, place: "Teaspoon - Palo Alto", checkedIn: ["Priya"] },
  { crew: "Chalk Pals", daysAgo: 3, place: "Movement San Francisco", checkedIn: ["Ava", "Diego", "Kai"] },
  { crew: "Sunset Crew", daysAgo: 2, place: "Genki Crepes", checkedIn: ["Ava"] },
  { crew: "Night Owls", daysAgo: 4, place: "The Guild Theatre", checkedIn: ["Noah", "Chloe"] },
  { crew: "Night Owls", daysAgo: 1, place: "Coupa Cafe - Ramona", checkedIn: ["Noah"] },
  { crew: "Boulder Buddies", daysAgo: 2, place: "Movement San Francisco", checkedIn: ["Kai", "Chloe"] },
];

const POT = {
  monthlyContribution: 20,
  memberContributions: { Uma: 10, Ishan: 15, Gauri: 10 } as Record<string, number>,
  sponsorChipIn: { business: "The Guild Theatre", amount: 10 },
};

const CHECKIN_POINTS = 50;
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
    const experienceIds = new Map<string, Id<"experiences">>();
    const option = (name: string, why: string, { experience, sponsorId }: { experience?: string; sponsorId?: Id<"sponsors"> } = {}) => {
      const place = placeByName(name);
      const price = BUSINESSES.flatMap((b) => b.experiences).find((e) => e.title === experience)?.pricePerPerson;
      const { min, max } = price === undefined ? priceRange(place.priceLevel) : { min: price, max: price };
      const experienceId = experience ? experienceIds.get(experience) : undefined;
      return { placeId: placeIds.get(name)!, title: name, costMin: min, costMax: max, why, travel: travelEstimate(place.area, place), experienceId, sponsorId };
    };

    const now = Date.now();
    const userIds = new Map<string, Id<"users">>();
    for (const [i, user] of USERS.entries()) {
      const busyBlocks = [1, 2, 3].map((d) => ({
        start: now + d * DAY + ((i % 4) + 1) * 2 * HOUR,
        end: now + d * DAY + ((i % 4) + 1) * 2 * HOUR + 2 * HOUR,
      }));
      const checkins = CREW_OUTINGS.filter((o) => o.checkedIn.includes(user.name)).length;
      userIds.set(user.name, await ctx.db.insert("users", { ...user, points: checkins * CHECKIN_POINTS, onboarded: true, busyBlocks }));
    }
    const idOf = (name: string) => userIds.get(name)!;

    const groupIds = new Map<string, Id<"groups">>();
    for (const crew of CREWS) {
      const memberIds = crew.members.map(idOf);
      groupIds.set(crew.name, await ctx.db.insert("groups", { name: crew.name, inviteCode: crew.inviteCode, ownerId: memberIds[0], memberIds }));
    }
    const hackCrew = CREWS[0];
    const groupId = groupIds.get(hackCrew.name)!;
    const hackIds = hackCrew.members.map(idOf);

    const businessIds: Id<"businesses">[] = [];
    for (const business of BUSINESSES) {
      const businessId = await ctx.db.insert("businesses", { name: business.name, earned: 0 });
      businessIds.push(businessId);
      for (const { place, ...experience } of business.experiences) {
        experienceIds.set(experience.title, await ctx.db.insert("experiences", { ...experience, businessId, placeId: placeIds.get(place)!, active: true }));
      }
    }

    const sponsorIds = new Map<string, Id<"sponsors">>();
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
      sponsorIds.set(place.name, sponsorId);
      for (const [u, userId] of [...userIds.values()].entries()) {
        await ctx.db.insert("rewards", { sponsorId, userId, code: `GOJI-${place.name.replace(/[^A-Z]/gi, "").slice(0, 6).toUpperCase()}-${i}${u}` });
      }
    }

    const ratingIds: Id<"ratings">[] = [];
    for (const past of PAST_PLANS) {
      const start = now - past.daysAgo * DAY;
      const planId = await ctx.db.insert("plans", {
        groupId,
        window: { start, end: start + 3 * HOUR },
        status: "done",
        options: past.places.map((name, i) => option(name, i === 0 ? past.why : "Matches your crew's vibe.")),
        winningIndex: 0,
        confirmBy: start - DAY,
      });
      for (const [u, userId] of hackIds.entries()) {
        await ctx.db.insert("votes", { planId, userId, optionIndex: 0, confirmed: true });
        const [stars, vibe] = past.ratings[u];
        ratingIds.push(await ctx.db.insert("ratings", { userId, planId, stars, vibe }));
      }
    }

    for (const outing of CREW_OUTINGS) {
      const crewId = groupIds.get(outing.crew)!;
      const start = now - outing.daysAgo * DAY;
      const planId = await ctx.db.insert("plans", {
        groupId: crewId,
        window: { start, end: start + 3 * HOUR },
        status: "done",
        options: [option(outing.place, "A quick crew hang this week.")],
        winningIndex: 0,
        confirmBy: start - DAY,
      });
      for (const name of outing.checkedIn) {
        const userId = idOf(name);
        await ctx.db.insert("votes", { planId, userId, optionIndex: 0, confirmed: true });
        // groupId and planId are #10's optional pointEvents fields; a non-literal object typechecks before and after #10 lands.
        const checkin = { userId, reason: "checkin" as const, points: CHECKIN_POINTS, groupId: crewId, planId };
        await ctx.db.insert("pointEvents", checkin);
      }
    }

    const lockedStart = now + 2 * DAY;
    const lockedPlanId = await ctx.db.insert("plans", {
      groupId,
      window: { start: lockedStart, end: lockedStart + 3 * HOUR },
      status: "locked",
      options: [
        option("The Guild Theatre", "Your crew loved music night. Demo package with a fictional $10 sponsor chip-in, not a venue offer.", {
          experience: "Demo: Crew music night",
          sponsorId: sponsorIds.get("The Guild Theatre"),
        }),
        option("Pizza My Heart - Palo Alto", "A crew favorite with a fictional $9 demo package, not a restaurant offer.", { experience: "Demo: Pizza study break" }),
        option("Arizona Garden", "A free garden walk on the Stanford campus."),
      ],
      winningIndex: 0,
      confirmBy: now + DAY,
    });
    for (const userId of hackIds) {
      await ctx.db.insert("votes", { planId: lockedPlanId, userId, optionIndex: 0, confirmed: true });
    }

    const memberTotal = Object.values(POT.memberContributions).reduce((a, b) => a + b, 0);
    const potId = await ctx.db.insert("pots", { groupId, balance: memberTotal + POT.sponsorChipIn.amount, monthlyContribution: POT.monthlyContribution });
    for (const [name, amount] of Object.entries(POT.memberContributions)) {
      await ctx.db.insert("transactions", { potId, type: "contribution", amount, userId: idOf(name), planId: lockedPlanId, status: "completed" });
    }
    await ctx.db.insert("transactions", {
      potId,
      type: "contribution",
      amount: POT.sponsorChipIn.amount,
      planId: lockedPlanId,
      status: "completed",
      note: POT.sponsorChipIn.business,
    });
    await ctx.runMutation(internal.cards.issueCard, { groupId });

    for (const userId of userIds.values()) {
      await ctx.scheduler.runAfter(0, internal.memory.rememberPreferences, { userId });
    }
    for (const ratingId of ratingIds) {
      await ctx.scheduler.runAfter(0, internal.memory.rememberRating, { ratingId });
    }

    return {
      userIds: [...userIds.values()],
      groupId,
      groupIds: [...groupIds.values()],
      lockedPlanId,
      potId,
      sponsorIds: [...sponsorIds.values()],
      businessIds,
      inviteCode: hackCrew.inviteCode,
      places: PLACES.length,
    };
  },
});
