import { useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation } from "convex/react";
import { Button, Card, ErrorState, LoadingState, Screen, Subtitle, Title } from "../components/ui";
import PointsPill from "../components/PointsPill";
import { brand, colors, font, radius, spacing } from "../constants/theme";
import { formatGojis } from "../lib/format";
import { mockDelay } from "../lib/mock";
import { useUserId } from "../lib/session";

const USE_MOCK = true;

// TODO(convex): swap to api.photos.generateUploadUrl once it lands
const generateUploadUrlRef = makeFunctionReference<"mutation", Record<string, never>, string>("photos:generateUploadUrl");
// TODO(convex): swap to api.photos.savePhoto once it lands
const savePhotoRef = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; storageId: Id<"_storage">; groupId?: Id<"groups">; planId?: Id<"plans">; questId?: Id<"soloQuests">; caption?: string },
  Id<"photos">
>("photos:savePhoto");
// TODO(convex): swap to api.solo.complete once it lands
const completeQuestRef = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; questId: Id<"soloQuests">; storageId: Id<"_storage"> },
  null
>("solo:complete");

const PHOTO_POINTS = 50;
const QUEST_POINTS = 25;

type Picked = { uri: string; mimeType: string };

export default function CameraScreen() {
  const router = useRouter();
  const { planId, groupId, questId } = useLocalSearchParams<{ planId?: string; groupId?: string; questId?: string }>();
  const { userId, loading: sessionLoading } = useUserId();
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const generateLive = useMutation(generateUploadUrlRef);
  const saveLive = useMutation(savePhotoRef);
  const completeLive = useMutation(completeQuestRef);
  const generateUploadUrl = USE_MOCK ? () => mockDelay("mock://upload", 300) : generateLive;
  const savePhoto = USE_MOCK ? (_args: Parameters<typeof saveLive>[0]) => mockDelay("photo_mock_1" as Id<"photos">, 700) : saveLive;
  const completeQuest = USE_MOCK ? (_args: Parameters<typeof completeLive>[0]) => mockDelay(null, 700) : completeLive;

  const isQuest = !!questId;
  const reward = isQuest ? QUEST_POINTS : PHOTO_POINTS;

  const pick = async () => {
    setError(null);
    setPermissionDenied(false);
    try {
      let result: ImagePicker.ImagePickerResult | null = null;
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.granted) {
        try {
          result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        } catch {
          result = null;
        }
      }
      if (!result) {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          setPermissionDenied(true);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      }
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the camera.");
    }
  };

  const chooseFromLibrary = async () => {
    setError(null);
    setPermissionDenied(false);
    try {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        setPermissionDenied(true);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open your photos.");
    }
  };

  const upload = async () => {
    if (!photo || !userId) return;
    setUploading(true);
    setError(null);
    try {
      let storageId = "mock_storage_1";
      if (!USE_MOCK) {
        const url = await generateUploadUrl({});
        const blob = await (await fetch(photo.uri)).blob();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": photo.mimeType }, body: blob });
        if (!res.ok) throw new Error("Upload failed. Check your connection and try again.");
        storageId = (await res.json()).storageId;
      } else {
        await generateUploadUrl({});
      }
      if (isQuest) {
        await completeQuest({ userId: userId as Id<"users">, questId: questId as Id<"soloQuests">, storageId: storageId as Id<"_storage"> });
      } else {
        await savePhoto({
          userId: userId as Id<"users">,
          storageId: storageId as Id<"_storage">,
          groupId: groupId ? (groupId as Id<"groups">) : undefined,
          planId: planId ? (planId as Id<"plans">) : undefined,
          caption: caption.trim() || undefined,
        });
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (sessionLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Check in" }} />
        <LoadingState testID="camera-loading" />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen testID="upload-success">
        <Stack.Screen options={{ title: "Checked in!" }} />
        <Card tone="success" style={styles.center}>
          <Text style={styles.big}>🎉</Text>
          <Title testID="upload-success-title">Photo uploaded!</Title>
          <Text testID="upload-success-points" style={styles.reward}>
            +{formatGojis(reward)}
          </Text>
          <PointsPill testID="upload-success-pill" size="lg" points={reward} />
          <Subtitle style={{ textAlign: "center" }}>Nice one. Your {brand.name} crew will see it in the story.</Subtitle>
        </Card>
        {groupId ? <Button testID="view-story" label="See group story" variant="secondary" onPress={() => router.replace(`/story/${groupId}`)} /> : null}
        <Button testID="upload-done" label="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: isQuest ? "Quest check-in" : "Photo check-in" }} />
      <Title testID="camera-title">{isQuest ? "Prove your quest" : "Snap the moment"}</Title>
      <Subtitle testID="camera-subtitle">
        {isQuest ? `Upload a photo to finish your solo quest and earn ${formatGojis(QUEST_POINTS)}.` : `Share a photo and earn ${formatGojis(PHOTO_POINTS)}.`}
      </Subtitle>

      {permissionDenied ? (
        <ErrorState
          testID="permission-error"
          message="We need camera or photo access to check you in. Enable it in Settings, or pick a photo instead."
          onRetry={pick}
        />
      ) : null}
      {error ? <ErrorState testID="upload-error" message={error} onRetry={photo ? upload : pick} /> : null}

      {photo ? (
        <>
          <Card testID="photo-preview" style={styles.previewCard}>
            <Image testID="photo-preview-image" source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
            <Button testID="retake-photo" label="Retake" variant="ghost" onPress={() => setPhoto(null)} disabled={uploading} />
          </Card>
          {isQuest ? null : (
            <TextInput
              testID="caption-input"
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption (optional)"
              placeholderTextColor={colors.textMuted}
              maxLength={140}
              style={styles.input}
            />
          )}
          <Button testID="upload-photo" label="Upload" onPress={upload} loading={uploading} disabled={!userId} />
        </>
      ) : (
        <Card testID="camera-empty" tone="muted" style={styles.center}>
          <Text style={styles.big}>📸</Text>
          <Button testID="take-photo" label="Take photo" icon="📷" onPress={pick} style={styles.fullWidth} />
          <Button testID="choose-photo" label="Choose from library" variant="secondary" onPress={chooseFromLibrary} style={styles.fullWidth} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: spacing.md },
  big: { fontSize: 56 },
  reward: { fontSize: font.size.hero, fontWeight: font.weight.heavy, color: colors.success },
  fullWidth: { alignSelf: "stretch" },
  previewCard: { padding: spacing.md, gap: spacing.sm },
  preview: { width: "100%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.cardMuted },
  input: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    fontSize: font.size.md,
    color: colors.text,
  },
});
