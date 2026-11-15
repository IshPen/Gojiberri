import { useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Button, Card, ErrorState, LoadingState, Screen, Subtitle, Title } from "../components/ui";
import { api } from "../convex/_generated/api";
import GojiBreakdown, { type GojiBreakdownData } from "../components/GojiBreakdown";
import { brand, colors, font, radius, spacing } from "../constants/theme";
import { formatGojis } from "../lib/format";
import { mockDelay, useMockQuery } from "../lib/mock";
import { useUserId } from "../lib/session";

const USE_MOCK = false;


// TODO(convex): swap to api.photos.generateUploadUrl once it lands
const generateUploadUrlRef = makeFunctionReference<"mutation", Record<string, never>, string>("photos:generateUploadUrl");
// TODO(convex): swap to api.photos.savePhoto once it lands
const savePhotoRef = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; storageId: Id<"_storage">; groupId?: Id<"groups">; planId?: Id<"plans">; caption?: string },
  { photoId: Id<"photos"> } & GojiBreakdownData
>("photos:savePhoto");

const MOCK_PLAN = { title: "Boba run at Asha Tea House", groupId: "mock_hack_crew" as Id<"groups"> };

const PHOTO_POINTS = 50;

type Picked = { uri: string; mimeType: string };

export default function CameraScreen() {
  const router = useRouter();
  const { planId, groupId } = useLocalSearchParams<{ planId?: string; groupId?: string }>();
  const { userId, loading: sessionLoading } = useUserId();
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [gojis, setGojis] = useState<GojiBreakdownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const generateLive = useMutation(generateUploadUrlRef);
  const saveLive = useMutation(savePhotoRef);
  const generateUploadUrl = USE_MOCK ? () => mockDelay("mock://upload", 300) : generateLive;
  const savePhoto = USE_MOCK ? (_args: Parameters<typeof saveLive>[0]) => mockDelay({ photoId: "photo_mock_1" as Id<"photos">, total: 0, items: [] }, 700) : saveLive;

  const livePlan = useQuery(api.plans.getPlan, USE_MOCK || !planId ? "skip" : { planId: planId as Id<"plans"> });
  const mockPlan = useMockQuery(MOCK_PLAN, USE_MOCK && !!planId);
  const plan = !planId
    ? null
    : USE_MOCK
      ? mockPlan
      : livePlan && { title: livePlan.options[livePlan.winningIndex ?? -1]?.title ?? "your crew's outing", groupId: livePlan.groupId };
  const planMissing = !!planId && !USE_MOCK && livePlan === null;
  const storyGroupId = groupId ?? plan?.groupId;

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
      const saved = await savePhoto({
        userId: userId as Id<"users">,
        storageId: storageId as Id<"_storage">,
        groupId: groupId ? (groupId as Id<"groups">) : undefined,
        planId: planId ? (planId as Id<"plans">) : undefined,
        caption: caption.trim() || undefined,
      });
      setGojis(saved);
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
          {gojis && gojis.total > 0 ? <GojiBreakdown data={gojis} /> : null}
          {plan ? (
            <Text testID="upload-success-plan" style={styles.planDone}>
              Checked in: {plan.title}
            </Text>
          ) : null}
          <Subtitle style={{ textAlign: "center" }}>Nice one. Your {brand.name} crew will see it in the story.</Subtitle>
        </Card>
        {storyGroupId ? (
          <Button testID="view-story" label="See group story" variant="secondary" onPress={() => router.replace(`/story/${storyGroupId}`)} />
        ) : null}
        <Button testID="upload-done" label="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "Photo check-in" }} />
      <Title testID="camera-title">Snap the moment</Title>
      <Subtitle testID="camera-subtitle">
        {planId ? `Check in on your crew's outing and earn ${formatGojis(PHOTO_POINTS)}.` : `Share a photo with your crew. Check in on a crew outing to earn ${brand.points}.`}
      </Subtitle>

      {planId ? (
        planMissing ? (
          <ErrorState testID="camera-plan-error" message="We couldn't find that outing. Head back and pick it from your crew's plans." />
        ) : plan ? (
          <Card testID="camera-plan" tone="accent" style={styles.planCard}>
            <Text testID="camera-plan-title" style={styles.planTitle} numberOfLines={2}>
              Checking in: {plan.title}
            </Text>
          </Card>
        ) : (
          <Text testID="camera-plan-loading" style={styles.planLoading}>
            Loading your outing…
          </Text>
        )
      ) : null}

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
          <TextInput
            testID="caption-input"
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption (optional)"
            placeholderTextColor={colors.textMuted}
            maxLength={140}
            style={styles.input}
          />
          <Button testID="upload-photo" label="Upload" onPress={upload} loading={uploading} disabled={!userId || planMissing || (!!planId && !plan)} />
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
  fullWidth: { alignSelf: "stretch" },
  planCard: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  planTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.accentDark },
  planLoading: { fontSize: font.size.sm, color: colors.textMuted },
  planDone: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text, textAlign: "center" },
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
