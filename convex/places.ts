import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { fitsBudget } from "./pricing";

const MIN_CANDIDATES = 8;

export const DEFAULT_CAMPUS = "Stanford";

export const CAMPUS_CENTERS: Record<string, { lat: number; lng: number }> = {
  Stanford: { lat: 37.4275, lng: -122.1697 },
  Berkeley: { lat: 37.8719, lng: -122.2585 },
  USF: { lat: 37.7766, lng: -122.4507 },
  "SF State": { lat: 37.7219, lng: -122.4782 },
};

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function travelEstimate(homeArea: string, place: { lat: number; lng: number }): string | undefined {
  const center = CAMPUS_CENTERS[homeArea];
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
