import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/src/auth";
import { CallRingListener } from "@/src/components/CallRingListener";
import { RestorePrompt } from "@/src/components/RestorePrompt";
import { RevenueCatBoot } from "@/src/components/RevenueCatBoot";
import { ToastProvider } from "@/src/components/Toast";
import { colors } from "@/src/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: "fade",
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="chat/[id]" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="call/[id]" options={{ animation: "slide_from_bottom" }} />
              <Stack.Screen name="team" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="builder/index" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="builder/[id]" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="builder-program" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="marketplace/index" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="paywall" options={{ animation: "slide_from_bottom" }} />
            </Stack>
            <CallRingListener />
            <RevenueCatBoot />
            <RestorePrompt />
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
