import { useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useQuery } from "convex/react";
import { Button, EmptyState, ErrorState, LoadingState, Screen, SectionHeader, Subtitle, Title } from "../../components/ui";
import PhotoGrid, { type GridPhoto } from "../../components/PhotoGrid";
import { brand, colors, font, minTapTarget, radius, spacing } from "../../constants/theme";
import { formatDay, formatTime } from "../../lib/format";
import { useMockQuery } from "../../lib/mock";

const USE_MOCK = true;

type StoryPhoto = {
  _id: Id<"photos">;
  url: string;
  userName: string;
  planTitle?: string;
  caption?: string;
  _creationTime: number;
};
// TODO(convex): swap to api.photos.getGroupStory once it lands
const getGroupStoryRef = makeFunctionReference<"query", { groupId: Id<"groups"> }, StoryPhoto[]>("photos:getGroupStory");

const NOW = Date.now();
const HOUR = 3600000;
const MOCK_STORY: StoryPhoto[] = [
  { _id: "p1" as Id<"photos">, url: "https://picsum.photos/seed/dolores/600/600", userName: "Gauri", planTitle: "Dolores Park picnic", caption: "Golden hour hit different", _creationTime: NOW - 1 * HOUR },
  { _id: "p2" as Id<"photos">, url: "https://picsum.photos/seed/picnic/600/600", userName: "Ishan", planTitle: "Dolores Park picnic", caption: "Snack spread", _creationTime: NOW - 2 * HOUR },
  { _id: "p3" as Id<"photos">, url: "https://picsum.photos/seed/hill/600/600", userName: "Uma", planTitle: "Dolores Park picnic", _creationTime: NOW - 3 * HOUR },
  { _id: "p4" as Id<"photos">, url: "https://picsum.photos/seed/ramen/600/600", userName: "Uma", planTitle: "Ramen night in Japantown", caption: "Tonkotsu supremacy", _creationTime: NOW - 30 * HOUR },
  { _id: "p5" as Id<"photos">, url: "https://picsum.photos/seed/noodles/600/600", userName: "Ishan", planTitle: "Ramen night in Japantown", caption: "Hack Crew dinner", _creationTime: NOW - 31 * HOUR },
  { _id: "p6" as Id<"photos">, url: "https://picsum.photos/seed/bridge/600/600", userName: "Gauri", planTitle: "Golden Gate bike ride", caption: "Foggy but worth it", _creationTime: NOW - 80 * HOUR },
  { _id: "p7" as Id<"photos">, url: "https://picsum.photos/seed/sfbay/600/600", userName: "Ishan", planTitle: "Golden Gate bike ride", _creationTime: NOW - 81 * HOUR },
  { _id: "p8" as Id<"photos">, url: "https://picsum.photos/seed/coffee/600/600", userName: "Uma", caption: "Pit stop", _creationTime: NOW - 82 * HOUR },
];

export default function StoryScreen() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [selected, setSelected] = useState<StoryPhoto | null>(null);

  const live = useQuery(getGroupStoryRef, USE_MOCK || !groupId ? "skip" : { groupId: groupId as Id<"groups"> });
  const mock = useMockQuery(MOCK_STORY, USE_MOCK);
  const photos = USE_MOCK ? mock : live;

  const sections = useMemo(() => {
    if (!photos) return [];
    const sorted = [...photos].sort((a, b) => b._creationTime - a._creationTime);
    const map = new Map<string, StoryPhoto[]>();
    for (const p of sorted) {
      const key = p.planTitle ?? "Extra moments";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [photos]);

  const addPhoto = () => router.push(`/camera?groupId=${groupId}`);

  return (
    <Screen testID="story-screen">
      <Stack.Screen options={{ title: "Group story" }} />
      <Title testID="story-title">{brand.emoji} Hack Crew story</Title>
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
