import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors, font } from "../../constants/theme";

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="recommended"
        options={{
          title: "For You",
          tabBarButtonTestID: "tab-recommended",
          tabBarIcon: ({ focused }) => <TabIcon emoji="✨" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Crews",
          tabBarButtonTestID: "tab-groups",
          tabBarIcon: ({ focused }) => <TabIcon emoji="👯" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          tabBarButtonTestID: "tab-leaderboard",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarButtonTestID: "tab-profile",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🍓" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
