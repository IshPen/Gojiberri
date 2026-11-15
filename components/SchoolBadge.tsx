import { useQuery } from "convex/react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, minTapTarget, radius, shadow, spacing, type } from "../constants/theme";
import { api } from "../convex/_generated/api";
import { SCHOOLS, schoolFor } from "../lib/school";

export function SchoolCrest({ school, size = 44, testID }: { school: string | null | undefined; size?: number; testID?: string }) {
  const s = schoolFor(school);
  return (
    <View
      testID={testID}
      style={[styles.crest, { width: size, height: size * 1.12, backgroundColor: s.color, borderBottomLeftRadius: size / 2, borderBottomRightRadius: size / 2 }]}
    >
      <Text style={[styles.crestText, { fontSize: size * (s.crest.length > 2 ? 0.26 : 0.4) }]} numberOfLines={1}>
        {s.crest}
      </Text>
    </View>
  );
}

export function SchoolHeader({ school, testID = "school-header-badge" }: { school: string | null | undefined; testID?: string }) {
  const crews = useQuery(api.points.groupLeaderboard, school ? { school, limit: 100 } : "skip");
  const s = schoolFor(school);
  const count = crews === undefined ? null : crews.length;
  return (
    <View testID={testID} style={styles.header}>
      <SchoolCrest school={school} size={34} testID={testID + "-crest"} />
      <View style={styles.headerBody}>
        <Text testID={testID + "-name"} style={styles.headerName} numberOfLines={1}>
          {school ? `${s.name} space` : "Pick your school"}
        </Text>
        <Text testID={testID + "-count"} style={styles.headerMeta} numberOfLines={1}>
          {!school ? "Join your campus to see its crews" : count === null ? "Counting crews…" : `${s.name} · ${count} ${count === 1 ? "crew" : "crews"} competing this week`}
        </Text>
      </View>
    </View>
  );
}

export function SchoolPicker({ selected, onSelect, counts }: { selected: string | null; onSelect: (school: string) => void; counts?: Map<string, { crews: number; students: number }> }) {
  return (
    <View testID="school-picker" style={styles.picker}>
      {SCHOOLS.map((s) => {
        const on = selected === s.name;
        const c = counts?.get(s.name);
        return (
          <Pressable
            key={s.slug}
            testID={`school-chip-${s.slug}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Join the ${s.name} space`}
            onPress={() => onSelect(s.name)}
            style={[styles.option, on && styles.optionOn]}
          >
            <SchoolCrest school={s.name} size={40} testID={`school-crest-${s.slug}`} />
            <View style={styles.headerBody}>
              <Text style={styles.optionName}>{s.name}</Text>
              <Text testID={`school-count-${s.slug}`} style={styles.headerMeta} numberOfLines={1}>
                {c ? `${c.crews} ${c.crews === 1 ? "crew" : "crews"} · ${c.students} ${c.students === 1 ? "student" : "students"} here` : s.tagline}
              </Text>
            </View>
            <Text style={styles.check}>{on ? "✓" : ""}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  crest: { alignItems: "center", justifyContent: "center", borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  crestText: { color: colors.textOnAccent, fontWeight: font.weight.heavy, letterSpacing: 0.5 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, ...shadow.sm },
  headerBody: { flex: 1, gap: 2 },
  headerName: { ...type.heading, fontSize: font.size.md },
  headerMeta: { ...type.label, fontWeight: font.weight.regular },
  picker: { gap: spacing.sm },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: minTapTarget + 20, padding: spacing.md, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionName: type.heading,
  check: { fontSize: font.size.xl, fontWeight: font.weight.heavy, width: 24, textAlign: "center", color: colors.accent },
});
