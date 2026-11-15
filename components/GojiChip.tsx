import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { brand, colors, font, radius, spacing } from "../constants/theme";

export type GojiPreviewItem = { reason: string; points: number; label: string; conditional?: boolean };
export type GojiPreview = { ideaKey: string; total: number; items: GojiPreviewItem[]; noveltyReason: string | null; scored: boolean };
export type IdeaFallback = { ideaKey: string; novel: boolean };

// HOME-35: points.gojiPreview and novelty.requestScores, referenced by name until they deploy. Flip PREVIEW_MOCK once they do.
const PREVIEW_MOCK = false;
const previewRef = makeFunctionReference<"query", { userId: Id<"users">; ideaKeys: string[] }, GojiPreview[]>("points:gojiPreview");
const requestScoresRef = makeFunctionReference<"mutation", { userId: Id<"users">; ideaKeys: string[] }, null>("novelty:requestScores");

function mockPreview({ ideaKey, novel }: IdeaFallback): GojiPreview {
  const items: GojiPreviewItem[] = [{ reason: "checkin", points: 50, label: "Check-in" }];
  if (novel) items.push({ reason: "novel_bonus", points: 24, label: "Tried something new" });
  items.push({ reason: "fullcrew_bonus", points: 20, label: "Whole crew showed up", conditional: true });
  return {
    ideaKey,
    total: items.filter((i) => !i.conditional).reduce((sum, i) => sum + i.points, 0),
    items,
    noveltyReason: novel ? "New for you: it's outside the vibes you usually swipe for." : null,
    scored: false,
  };
}

export function useGojiPreviews(userId: string | null, ideas: IdeaFallback[]): Map<string, GojiPreview> {
  const ideaKeys = ideas.map((i) => i.ideaKey);
  const joined = ideaKeys.join(",");
  const live = useQuery(previewRef, PREVIEW_MOCK || !userId || ideaKeys.length === 0 ? "skip" : { userId: userId as Id<"users">, ideaKeys });
  const requestScores = useMutation(requestScoresRef);

  useEffect(() => {
    if (PREVIEW_MOCK || !userId || !joined) return;
    const timer = setTimeout(() => requestScores({ userId: userId as Id<"users">, ideaKeys: joined.split(",") }).catch(() => {}), 800);
    return () => clearTimeout(timer);
  }, [joined, requestScores, userId]);

  const previews = PREVIEW_MOCK ? ideas.map(mockPreview) : live ?? [];
  return new Map(previews.map((p) => [p.ideaKey, p]));
}

export default function GojiChip({ preview, testID }: { preview: GojiPreview | undefined; testID: string }) {
  const [open, setOpen] = useState(false);
  if (!preview) return null;
  return (
    <View style={styles.wrap}>
      <Pressable testID={testID} onPress={() => setOpen((o) => !o)} accessibilityRole="button" style={styles.chip}>
        <Text style={styles.chipText}>
          {brand.pointsEmoji} +{preview.total} {brand.points} for you {open ? "▴" : "▾"}
        </Text>
      </Pressable>
      {open ? (
        <View testID={`${testID}-breakdown`} style={styles.breakdown}>
          {preview.items.map((item) => (
            <View key={item.reason} style={styles.row}>
              <Text style={[styles.points, item.conditional && styles.muted]}>+{item.points}</Text>
              <Text style={[styles.label, item.conditional && styles.muted]}>
                {item.label}
                {item.conditional ? " · if everyone comes" : ""}
              </Text>
            </View>
          ))}
          {preview.noveltyReason ? (
            <Text style={styles.reason}>
              🧭 {preview.noveltyReason}
              {preview.scored ? "" : " · scoring…"}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chip: { alignSelf: "flex-start", backgroundColor: colors.warningSoft, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipText: { fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.text },
  breakdown: { backgroundColor: colors.cardMuted, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.md },
  points: { width: 40, fontSize: font.size.md, fontWeight: font.weight.heavy, color: colors.success, textAlign: "right" },
  label: { flex: 1, fontSize: font.size.md, color: colors.text },
  muted: { color: colors.textMuted },
  reason: { fontSize: font.size.sm, color: colors.textMuted, marginTop: spacing.xs },
});
