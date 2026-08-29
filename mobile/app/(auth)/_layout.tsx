import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

export default function AuthLayout() {
  const { token, loading } = useAuth();
  if (!loading && token) return <Redirect href="/(tabs)/home" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
