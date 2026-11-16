import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from "expo-router";
import type { FunctionReturnType } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { EmptyState, ErrorState, LoadingState, Screen } from "../../components/ui";
import { colors, font, radius, spacing } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { initialsFor } from "../../lib/avatar";

type StoryPhoto = FunctionReturnType<typeof api.photos.getGroupStory>[number] & { url: string };

const STORY_LENGTH = 3;
const SLIDE_MS = 4000;

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="story-screen">
      <Stack.Screen options={{ title: "Group story" }} />
      <ErrorState testID="story-error" message="Couldn't load your crew's story." onRetry={retry} />
    </Screen>
  );
}

function ago(ms: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function StoryScreen() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const args = groupId ? { groupId: groupId as Id<"groups"> } : "skip";
  const story = useQuery(api.photos.getGroupStory, args);
  const group = useQuery(api.groups.getGroup, args);

  const slides = useMemo(() => {
    if (!story) return undefined;
    const newest = story.filter((p): p is StoryPhoto => !!p.url).sort((a, b) => b.takenAt - a.takenAt || b._creationTime - a._creationTime);
    const latestPlan = newest.find((p) => p.planId)?.planId;
    const fromOuting = latestPlan ? newest.filter((p) => p.planId === latestPlan) : [];
    const picked = (fromOuting.length >= STORY_LENGTH ? fromOuting : newest).slice(0, STORY_LENGTH);
    return picked.reverse();
  }, [story]);

  const [index, setIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const pausedAt = useRef<number | null>(null);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace(groupId ? `/group/${groupId}` : "/(tabs)/groups");
  };

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animate = (from: number) => {
    const duration = SLIDE_MS * (1 - from);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIndex((i) => i + 1), duration);
    Animated.timing(progress, { toValue: 1, duration, useNativeDriver: false }).start();
  };

  const count = slides?.length ?? 0;
  useEffect(() => {
    if (count === 0) return;
    if (index >= count) {
      close();
      return;
    }
    pausedAt.current = null;
    progress.setValue(0);
    animate(0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      progress.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  const go = (next: number) => setIndex(Math.max(0, next));
  const pause = () => {
    if (timer.current) clearTimeout(timer.current);
    progress.stopAnimation((v) => (pausedAt.current = v));
  };
  const resume = () => {
    if (pausedAt.current === null) return;
    const from = pausedAt.current;
    pausedAt.current = null;
    animate(from);
  };

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) close();
      },
    }),
  ).current;

  const addPhoto = () => router.push(`/camera?groupId=${groupId}`);

  if (!groupId) {
    return (
      <Screen testID="story-screen">
        <ErrorState testID="story-error" message="We couldn't find that group." onRetry={() => router.back()} />
      </Screen>
    );
  }
  if (slides === undefined) {
    return (
      <Screen testID="story-screen">
        <Stack.Screen options={{ title: "Group story" }} />
        <LoadingState testID="story-loading" label="Loading photos…" />
      </Screen>
    );
  }
  if (slides.length === 0) {
    return (
      <Screen testID="story-screen">
        <Stack.Screen options={{ title: "Group story" }} />
        <EmptyState
          testID="story-empty"
          emoji="📷"
          title="No photos yet"
          body="Be the first to share a moment from your plans."
          actionLabel="Add the first photo"
          actionTestID="story-add-photo"
          onAction={addPhoto}
        />
      </Screen>
    );
  }

  const photo = slides[Math.min(index, slides.length - 1)];
  return (
    <View testID="story-screen" style={styles.root} {...swipe.panHandlers}>
      <Stack.Screen options={{ headerShown: false }} />
      <Image testID="story-viewer-image" source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.shade} pointerEvents="none" />
      <View style={styles.taps}>
        <Pressable
          testID="story-prev"
          accessibilityRole="button"
          accessibilityLabel="Previous photo"
          style={styles.prev}
          onPress={() => go(index - 1)}
          onPressIn={pause}
          onPressOut={resume}
          onLongPress={() => {}}
          delayLongPress={250}
        />
        <Pressable
          testID="story-next"
          accessibilityRole="button"
          accessibilityLabel="Next photo"
          style={styles.next}
          onPress={() => go(index + 1)}
          onPressIn={pause}
          onPressOut={resume}
          onLongPress={() => {}}
          delayLongPress={250}
        />
      </View>
      <SafeAreaView testID="story-viewer" style={styles.top} pointerEvents="box-none">
        <View style={styles.bars}>
          {slides.map((s, i) => (
            <View key={s._id} testID={`story-progress-${i}`} style={styles.track}>
              <Animated.View
                style={[
                  styles.fill,
                  { width: i < index ? "100%" : i > index ? "0%" : progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsFor(photo.userName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text testID="story-title" style={styles.crew} numberOfLines={1}>
              {group?.name ?? "Your crew"}
            </Text>
            <Text testID="story-viewer-author" style={styles.author} numberOfLines={1}>
              {photo.userName} · {ago(photo.takenAt)}
            </Text>
          </View>
          <Pressable testID="story-add-photo" accessibilityRole="button" accessibilityLabel="Add photo" hitSlop={8} onPress={addPhoto} style={styles.icon}>
            <Text style={styles.iconText}>📸</Text>
          </Pressable>
          <Pressable testID="story-viewer-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={close} style={styles.icon}>
            <Text style={styles.iconText}>✕</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  shade: { position: "absolute", top: 0, left: 0, right: 0, height: 140, backgroundColor: "rgba(0,0,0,0.35)" },
  taps: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row" },
  prev: { flex: 1 },
  next: { flex: 2 },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.md, gap: spacing.sm },
  bars: { flexDirection: "row", gap: 4, paddingTop: spacing.sm },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" },
  fill: { height: 3, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: font.size.sm, fontWeight: font.weight.heavy, color: colors.accentDark },
  crew: { color: "#fff", fontSize: font.size.md, fontWeight: font.weight.bold },
  author: { color: "rgba(255,255,255,0.85)", fontSize: font.size.sm },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  iconText: { color: "#fff", fontSize: font.size.lg, fontWeight: font.weight.bold },
});
