import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import { colors, emoji, font, radius } from "../../constants/theme";

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <View
      style={{
        width: 48,
        height: 30,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? colors.accentSoft : "transparent",
      }}
    >
      <Text style={{ fontSize: emoji.sm, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>
    </View>
  );
}

const TABS = [
  { name: "recommended", title: "For You", glyph: "✨" },
  { name: "groups", title: "Crews", glyph: "👯" },
  { name: "experiences", title: "Explore", glyph: "🎟️", hidden: true },
  { name: "leaderboard", title: "Ranks", glyph: "🏆" },
  { name: "profile", title: "Profile", glyph: "🍓" },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "shift",
        tabBarActiveTintColor: colors.accentDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, minHeight: 64, paddingTop: 6 },
        tabBarItemStyle: { paddingBottom: 4 },
        tabBarLabelStyle: { fontSize: font.size.xs, fontWeight: font.weight.bold, lineHeight: 16 },
        tabBarAllowFontScaling: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            href: "hidden" in t && t.hidden ? null : undefined,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ focused }) => <TabIcon glyph={t.glyph} focused={focused} />,
          }}
        />
      ))}
    </Tabs>
  );
}
