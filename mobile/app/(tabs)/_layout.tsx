import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import ForcePasswordChange from "@/src/components/ForcePasswordChange";
import BudgetNudge from "@/src/components/BudgetNudge";
import { useAuth } from "@/src/auth";
import { getItem, setItem } from "@/src/storage";
import { colors } from "@/src/theme";

const WHATS_NEW_SEEN_KEY = "whatsnew_seen_v1";

export default function TabsLayout() {
  const { token, user, loading } = useAuth();
  const [seenNew, setSeenNew] = useState(true);

  useEffect(() => {
    (async () => {
      const seen = await getItem(WHATS_NEW_SEEN_KEY);
      setSeenNew(!!seen);
    })();
  }, []);

  const markNewSeen = () => {
    if (seenNew) return;
    setSeenNew(true);
    setItem(WHATS_NEW_SEEN_KEY, "1");
  };

  if (!loading && !token) return <Redirect href="/(auth)/login" />;

  // Admin-provisioned accounts must set their own password before the app.
  if (token && user?.must_change_password) return <ForcePasswordChange />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bgElevated,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 84,
            paddingTop: 8,
            paddingBottom: 28,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Chats",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="research"
          options={{
            title: "Research",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="sparkles" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: "Tasks",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="checkbox" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="you"
          options={{
            title: "You",
            tabBarIcon: ({ color, size }) => (
              <View>
                <Ionicons name="person-circle" size={size} color={color} />
                {!seenNew ? (
                  <View
                    testID="you-tab-new-dot"
                    style={{
                      position: "absolute",
                      top: -1,
                      right: -1,
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: colors.accent,
                      borderWidth: 1.5,
                      borderColor: colors.bgElevated,
                    }}
                  />
                ) : null}
              </View>
            ),
          }}
          listeners={{ tabPress: markNewSeen }}
        />
      </Tabs>
      <BudgetNudge />
    </View>
  );
}
