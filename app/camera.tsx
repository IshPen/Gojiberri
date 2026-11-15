import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { makeFunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { Button, Card, ErrorState, LoadingState, Screen, Subtitle, Title } from "../components/ui";
import PointsPill from "../components/PointsPill";
import { brand, colors, font, radius, spacing } from "../constants/theme";
import { formatGojis } from "../lib/format";
import { mockDelay } from "../lib/mock";
import { useUserId } from "../lib/session";

const USE_MOCK = true;
const MOCK_VERDICT = "approved" as CheckInVerdict;
const MOCK_REJECT_REASON = "This looks like a screenshot, not a photo taken at Tartine Bakery.";
const MOCK_INITIAL: CheckIn = { status: "open" };

type CheckInVerdict = "approved" | "rejected" | "unsure";
type CheckIn = {
  status: "open" | "verifying" | "done" | "skipped";
  verdict?: CheckInVerdict;
  reason?: string;
};

// TODO(convex): swap to api.photos.generateUploadUrl once it lands
const generateUploadUrlRef = makeFunctionReference<"mutation", Record<string, never>, string>("photos:generateUploadUrl");
// TODO(convex): swap to api.photos.savePhoto once it lands
const savePhotoRef = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; storageId: Id<"_storage">; groupId?: Id<"groups">; planId?: Id<"plans">; questId?: Id<"soloQuests">; caption?: string },
  Id<"photos">
>("photos:savePhoto");
// TODO(convex): swap to api.solo.submitCheckIn once it lands
const submitCheckInRef = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; questId: Id<"soloQuests">; storageId: Id<"_storage">; lat?: number; lng?: number },
  null
>("solo:submitCheckIn");
// TODO(convex): swap to api.solo.getCheckIn once it lands
const getCheckInRef = makeFunctionReference<"query", { questId: Id<"soloQuests"> }, CheckIn | null>("solo:getCheckIn");

const PHOTO_POINTS = 50;
const QUEST_POINTS = 25;

type Picked = { uri: string; mimeType: string };

const LOCATION_TIMEOUT_MS = 6000;

async function currentCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
  } catch {
    return null;
  }
  const position = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    .then((p) => ({ lat: p.coords.latitude, lng: p.coords.longitude }))
    .catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS));
  return Promise.race([position, timeout]);
}

export default function CameraScreen() {
  const router = useRouter();
  const { planId, groupId, questId } = useLocalSearchParams<{ planId?: string; groupId?: string; questId?: string }>();
  const { userId, loading: sessionLoading } = useUserId();
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [noLocation, setNoLocation] = useState(false);
  const [mockCheckIn, setMockCheckIn] = useState<CheckIn>(MOCK_INITIAL);
  const submitting = useRef(false);

  const generateLive = useMutation(generateUploadUrlRef);
  const saveLive = useMutation(savePhotoRef);
  const submitLive = useMutation(submitCheckInRef);
  const generateUploadUrl = USE_MOCK ? () => mockDelay("mock://upload", 300) : generateLive;
  const savePhoto = USE_MOCK ? (_args: Parameters<typeof saveLive>[0]) => mockDelay("photo_mock_1" as Id<"photos">, 700) : saveLive;
  const submitCheckIn = USE_MOCK
    ? async (_args: Parameters<typeof submitLive>[0]) => {
        setMockCheckIn({ status: "verifying" });
        return mockDelay(null, 500);
      }
    : submitLive;

  const isQuest = !!questId;
  const reward = isQuest ? QUEST_POINTS : PHOTO_POINTS;

  const liveCheckIn = useQuery(getCheckInRef, USE_MOCK || !isQuest ? "skip" : { questId: questId as Id<"soloQuests"> });
  const checkIn = USE_MOCK ? mockCheckIn : liveCheckIn;

  useEffect(() => {
    if (!USE_MOCK || mockCheckIn.status !== "verifying") return;
    const timer = setTimeout(() => {
      setMockCheckIn(
        MOCK_VERDICT === "rejected"
          ? { status: "skipped", verdict: "rejected", reason: MOCK_REJECT_REASON }
          : { status: "done", verdict: MOCK_VERDICT },
      );
    }, 2500);
    return () => clearTimeout(timer);
  }, [mockCheckIn]);

  const questLoading = isQuest && checkIn === undefined;
  const verifying = isQuest && checkIn?.status === "verifying";
  const approved = isQuest && submitted && checkIn?.status === "done";
  const rejected = isQuest && submitted && checkIn?.status === "skipped";
  const alreadyUsed = isQuest && !submitted && (checkIn?.status === "done" || checkIn?.status === "skipped");

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
        if (isQuest) {
          setError(cam.granted ? "Quests need a fresh photo from your camera, and no camera is available here." : null);
          setPermissionDenied(!cam.granted);
          return;
        }
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
    if (!photo || !userId || submitting.current) return;
    if (isQuest && checkIn?.status !== "open") {
      setError("You've already checked in for today's quest.");
      return;
    }
    submitting.current = true;
    setUploading(true);
    setError(null);
    try {
      const coords = isQuest ? await currentCoords() : null;
      setNoLocation(isQuest && !coords);
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
        await submitCheckIn({
          userId: userId as Id<"users">,
          questId: questId as Id<"soloQuests">,
          storageId: storageId as Id<"_storage">,
          lat: coords?.lat,
          lng: coords?.lng,
        });
        setSubmitted(true);
      } else {
        await savePhoto({
          userId: userId as Id<"users">,
          storageId: storageId as Id<"_storage">,
          groupId: groupId ? (groupId as Id<"groups">) : undefined,
          planId: planId ? (planId as Id<"plans">) : undefined,
          caption: caption.trim() || undefined,
        });
        setDone(true);
      }
    } catch (e) {
      submitting.current = false;
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (sessionLoading || questLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Check in" }} />
        <LoadingState testID="camera-loading" />
      </Screen>
    );
  }

  if (verifying) {
    return (
      <Screen testID="checking-photo">
        <Stack.Screen options={{ title: "Checking…" }} />
        <Card tone="muted" style={styles.center}>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" /> : null}
          <Text style={styles.big}>🔍</Text>
          <Title testID="checking-photo-title" style={{ textAlign: "center" }}>
            Checking your photo…
          </Title>
          <Subtitle style={{ textAlign: "center" }}>Making sure it matches today's quest. This takes a few seconds.</Subtitle>
          <LoadingState testID="checking-photo-spinner" label="" />
        </Card>
      </Screen>
    );
  }

  if (rejected) {
    return (
      <Screen testID="check-rejected">
        <Stack.Screen options={{ title: "Not quite" }} />
        <Card style={[styles.center, { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }]}>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" /> : null}
          <Text style={styles.big}>🤔</Text>
          <Title testID="check-rejected-title" style={{ textAlign: "center" }}>
            That doesn't look like the quest
          </Title>
          <Text testID="check-rejected-reason" style={styles.reason}>
            {checkIn?.reason ?? "We couldn't match this photo to today's quest."}
          </Text>
          <Subtitle style={{ textAlign: "center" }}>Each quest gets one check-in, so no {brand.points} today. A new quest drops tomorrow at 8am.</Subtitle>
        </Card>
        <Button testID="checkin-back-home" label="Back to home" onPress={() => router.replace("/home")} />
      </Screen>
    );
  }

  if (alreadyUsed) {
    const wasDone = checkIn?.status === "done";
    return (
      <Screen testID="quest-already-submitted">
        <Stack.Screen options={{ title: "Quest check-in" }} />
        <Card tone={wasDone ? "success" : "muted"} style={styles.center}>
          <Text style={styles.big}>{wasDone ? "✅" : "🗓️"}</Text>
          <Title testID="quest-already-submitted-title" style={{ textAlign: "center" }}>
            {wasDone ? "Quest already complete" : "Today's check-in is used"}
          </Title>
          <Subtitle style={{ textAlign: "center" }}>
            {wasDone ? "You already earned your Gojis for this one." : checkIn?.reason ?? "Each quest gets one check-in."} A new quest drops tomorrow at 8am.
          </Subtitle>
        </Card>
        <Button testID="checkin-back-home" label="Back to home" onPress={() => router.replace("/home")} />
      </Screen>
    );
  }

  if (done || approved) {
    return (
      <Screen testID="upload-success">
        <Stack.Screen options={{ title: "Checked in!" }} />
        <Card tone="success" style={styles.center}>
          <Text style={styles.big}>🎉</Text>
          <Title testID="upload-success-title">{isQuest ? "Quest complete!" : "Photo uploaded!"}</Title>
          <Text testID="upload-success-points" style={styles.reward}>
            +{formatGojis(reward)}
          </Text>
          <PointsPill testID="upload-success-pill" size="lg" points={reward} />
          <Subtitle style={{ textAlign: "center" }}>
            {isQuest ? "Verified ✓ Your streak keeps growing." : `Nice one. Your ${brand.name} crew will see it in the story.`}
          </Subtitle>
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
        {isQuest
          ? `Take a photo at the spot. We'll check it matches your quest, then you earn ${formatGojis(QUEST_POINTS)}.`
          : `Share a photo and earn ${formatGojis(PHOTO_POINTS)}.`}
      </Subtitle>

      {permissionDenied ? (
        <ErrorState
          testID="permission-error"
          message={isQuest ? "We need camera access to check you in. Enable it in Settings." : "We need camera or photo access to check you in. Enable it in Settings, or pick a photo instead."}
          onRetry={pick}
        />
      ) : null}
      {error ? <ErrorState testID="upload-error" message={error} onRetry={photo ? upload : pick} /> : null}
      {noLocation && !error ? (
        <Text testID="location-note" style={styles.note}>
          📍 Location is off, so the check relies on the photo alone.
        </Text>
      ) : null}

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
          <Button testID="upload-photo" label={isQuest ? "Submit check-in" : "Upload"} onPress={upload} loading={uploading} disabled={!userId} />
        </>
      ) : (
        <Card testID="camera-empty" tone="muted" style={styles.center}>
          <Text style={styles.big}>📸</Text>
          <Button testID="take-photo" label="Take photo" icon="📷" onPress={pick} style={styles.fullWidth} />
          {isQuest ? (
            <Text testID="fresh-photo-note" style={styles.note}>
              Quests need a fresh photo, so the photo library is off here.
            </Text>
          ) : (
            <Button testID="choose-photo" label="Choose from library" variant="secondary" onPress={chooseFromLibrary} style={styles.fullWidth} />
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: spacing.md },
  big: { fontSize: 56 },
  reward: { fontSize: font.size.hero, fontWeight: font.weight.heavy, color: colors.success },
  reason: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text, textAlign: "center", lineHeight: 22 },
  note: { fontSize: font.size.sm, color: colors.textMuted, textAlign: "center" },
  fullWidth: { alignSelf: "stretch" },
  thumb: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.cardMuted },
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
