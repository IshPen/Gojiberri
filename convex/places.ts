import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { fitsBudget } from "./pricing";

const MIN_CANDIDATES = 8;

export const AREA_CENTERS: Record<string, { lat: number; lng: number }> = {
  Mission: { lat: 37.7599, lng: -122.4148 },
  "Hayes Valley": { lat: 37.7759, lng: -122.4245 },
  SoMa: { lat: 37.7785, lng: -122.4056 },
  "Inner Richmond": { lat: 37.7802, lng: -122.4645 },
  "Outer Richmond": { lat: 37.7778, lng: -122.4935 },
  "Nob Hill": { lat: 37.793, lng: -122.4161 },
  Chinatown: { lat: 37.7941, lng: -122.4078 },
  "North Beach": { lat: 37.8061, lng: -122.4103 },
  Marina: { lat: 37.8037, lng: -122.4368 },
  Tenderloin: { lat: 37.7847, lng: -122.4141 },
  "Fisherman's Wharf": { lat: 37.808, lng: -122.4177 },
  Dogpatch: { lat: 37.7609, lng: -122.3892 },
  "Twin Peaks": { lat: 37.7544, lng: -122.4477 },
  "Golden Gate Park": { lat: 37.7694, lng: -122.4862 },
  Presidio: { lat: 37.7989, lng: -122.4662 },
  Embarcadero: { lat: 37.7993, lng: -122.3977 },
  Castro: { lat: 37.7609, lng: -122.435 },
};

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function travelEstimate(homeArea: string, place: { lat: number; lng: number }): string | undefined {
  const center = AREA_CENTERS[homeArea];
  if (!center) return undefined;
  const mins = Math.max(5, Math.round((distanceKm(center, place) / 15) * 60));
  return `~${mins} min by transit`;
}

export function rideShareLink(place: { lat: number; lng: number }): string {
  return `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${place.lat}&dropoff[longitude]=${place.lng}`;
}

export const listCandidates = internalQuery({
  args: { budgetMax: v.number(), areas: v.array(v.string()) },
  handler: async (ctx, { budgetMax, areas }) => {
    const affordable = (places: Doc<"places">[]) =>
      places.filter((p) => fitsBudget(p.priceLevel, budgetMax));

    const nearby: Doc<"places">[] = [];
    for (const area of new Set(areas)) {
      const inArea = await ctx.db
        .query("places")
        .withIndex("by_area", (q) => q.eq("area", area))
        .collect();
      nearby.push(...affordable(inArea));
    }
    if (nearby.length >= MIN_CANDIDATES) return nearby;

    const all = affordable(await ctx.db.query("places").collect());
    const nearbyIds = new Set(nearby.map((p) => p._id));
    return [...nearby, ...all.filter((p) => !nearbyIds.has(p._id))];
  },
});
