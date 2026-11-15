import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { BerryMark, Button, ErrorState, Screen, Subtitle } from "../../components/ui";
import { SchoolCrest, SchoolPicker } from "../../components/SchoolBadge";
import { brand, colors, font, spacing, type } from "../../constants/theme";
import { api } from "../../convex/_generated/api";
import { schoolFor } from "../../lib/school";

export default function SchoolScreen() {
  const router = useRouter();
  const [school, setSchool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const schools = useQuery(api.points.schoolLeaderboard, { limit: 20 });
  const crews = useQuery(api.points.groupLeaderboard, { limit: 200 });

  const counts = useMemo(() => {
    if (!schools || !crews) return undefined;
    const map = new Map<string, { crews: number; students: number }>();
    for (const s of schools) map.set(s.school, { crews: 0, students: s.userCount });
    for (const c of crews) {
      const entry = map.get(c.school) ?? { crews: 0, students: 0 };
      entry.crews += 1;
      map.set(c.school, entry);
    }
    return map;
  }, [schools, crews]);

  const picked = school ? schoolFor(school) : null;
  const here = school ? counts?.get(school) : undefined;

  const onContinue = () => {
    if (!school) {
      setError("Pick your school first. That's where your crew competes.");
      return;
    }
    router.push({ pathname: "/onboarding/name", params: { school } });
  };

  return (
    <Screen
      testID="school-screen"
      footer={
        <Button
          testID="school-continue"
          label={picked ? `Join the ${picked.name} space` : "Pick your school"}
          onPress={onContinue}
          disabled={!school}
        />
      }
    >
      <View style={styles.hero}>
        {picked ? (
          <SchoolCrest school={picked.name} size={72} testID="school-hero-crest" />
        ) : (
          <BerryMark testID="school-hero-emoji" size={96} />
        )}
        <Text style={styles.wordmark}>{brand.name.toLowerCase()}</Text>
        <Text testID="school-title" style={styles.heroTitle}>
          {picked ? `Join the ${picked.name} space` : "Pick your school"}
        </Text>
        <Subtitle testID="school-subtitle" style={styles.center}>
          {picked
            ? here
              ? `${here.crews} ${here.crews === 1 ? "crew" : "crews"} and ${here.students} ${here.students === 1 ? "student" : "students"} are already here. Your crew vs. theirs starts now.`
              : `Be one of the first crews at ${picked.name}. Your crew vs. theirs starts now.`
            : `${brand.name} is your campus's space. Join your school, then start or join a crew with your friends and climb your school's board.`}
        </Subtitle>
      </View>

      {error ? <ErrorState testID="school-error" message={error} onRetry={() => setError(null)} /> : null}
      {schools === undefined || crews === undefined ? (
        <Text testID="school-counts-loading" style={styles.loading}>
          Counting crews on each campus…
        </Text>
      ) : null}

      <SchoolPicker
        selected={school}
        onSelect={(s) => {
          setSchool(s);
          setError(null);
        }}
        counts={counts}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.lg },
  wordmark: { ...type.eyebrow, marginTop: spacing.sm, letterSpacing: 3 },
  heroTitle: { ...type.display, textAlign: "center" },
  center: { textAlign: "center" },
  loading: { fontSize: font.size.sm, color: colors.textMuted, textAlign: "center" },
});
