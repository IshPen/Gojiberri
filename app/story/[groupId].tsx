import { useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from "expo-router";
import type { FunctionReturnType } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { Button, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import PhotoGrid, { type GridPhoto } from "../../components/PhotoGrid";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { cleanTitle, formatDay, formatTime } from "../../lib/format";
import { api } from "../../convex/_generated/api";

type StoryPhoto = FunctionReturnType<typeof api.photos.getGroupStory>[number] & { url: string };

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="story-screen">
      <Stack.Screen options={{ title: "Group story" }} />
      <ErrorState testID="story-error" message="Couldn't load your crew's story." onRetry={retry} />
    </Screen>
  );
}

export default function StoryScreen() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [selected, setSelected] = useState<StoryPhoto | null>(null);

  const args = groupId ? { groupId: groupId as Id<"groups"> } : "skip";
  const story = useQuery(api.photos.getGroupStory, args);
  const group = useQuery(api.groups.getGroup, args);
  const photos = useMemo(() => story?.filter((p): p is StoryPhoto => !!p.url), [story]);

  const sections = useMemo(() => {
    if (!photos) return [];
    const sorted = [...photos].sort((a, b) => b._creationTime - a._creationTime);
    const map = new Map<string, StoryPhoto[]>();
    for (const p of sorted) {
      const key = p.planTitle ? cleanTitle(p.planTitle) : "Extra moments";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [photos]);

  const addPhoto = () => router.push(`/camera?groupId=${groupId}`);

  return (
    <Screen testID="story-screen">
      <Stack.Screen options={{ title: "Group story" }} />
      <Title testID="story-title">{brand.emoji} {group?.name ?? "Your crew"} story</Title>
      <Subtitle>Every moment from your plans, newest first.</Subtitle>

      {!groupId ? (
        <ErrorState testID="story-error" message="We couldn't find that group." onRetry={() => router.back()} />
      ) : photos === undefined ? (
        <LoadingState testID="story-loading" label="Loading photos…" />
      ) : photos.length === 0 ? (
        <EmptyState
          testID="story-empty"
          emoji="📷"
          title="No photos yet"
          body="Be the first to share a moment from your plans."
          actionLabel="Add the first photo"
          actionTestID="story-add-photo"
          onAction={addPhoto}
        />
      ) : (
        <>
          <Button testID="story-add-more" label="Add photo" icon="📸" variant="secondary" onPress={addPhoto} />
          {sections.map(([title, items], s) => (
            <View key={title} testID={`story-section-${s}`} style={styles.section}>
              <SectionHeader title={title} testID={`story-section-title-${s}`} />
              <PhotoGrid photos={items} onPressPhoto={(p) => setSelected(items.find((i) => i._id === p._id) ?? null)} testIDPrefix={s === 0 ? "photo-tile" : `photo-tile-s${s}`} />
            </View>
          ))}
        </>
      )}

      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelected(null)}>
        <SafeAreaView testID="story-viewer" style={styles.viewer}>
          <Pressable testID="story-viewer-close" accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSelected(null)} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          {selected ? (
            <View style={styles.viewerBody}>
              <Image testID="story-viewer-image" source={{ uri: selected.url }} style={styles.viewerImage} resizeMode="contain" />
              <Text testID="story-viewer-author" style={styles.author}>
                {selected.userName} · {formatDay(selected._creationTime)} {formatTime(selected._creationTime)}
              </Text>
              {selected.caption ? (
                <Text testID="story-viewer-caption" style={styles.caption}>
                  {selected.caption}
                </Text>
              ) : null}
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)" },
  close: { alignSelf: "flex-end", minWidth: minTapTarget, minHeight: minTapTarget, alignItems: "center", justifyContent: "center", margin: spacing.md },
  closeText: { color: "#fff", fontSize: font.size.xl, fontWeight: font.weight.bold },
  viewerBody: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg, gap: spacing.md },
  viewerImage: { width: "100%", aspectRatio: 1, borderRadius: radius.lg },
  author: { color: colors.accentSoft, fontSize: font.size.md, fontWeight: font.weight.bold },
  caption: { color: "#fff", fontSize: font.size.lg },
});
