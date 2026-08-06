// NATIVE call screen (iOS/Android). Metro resolves CallScreen.web.tsx for web,
// so this file's @livekit/react-native import never reaches the web bundle.
// registerGlobals() wires up the native WebRTC globals before any Room is made.
import { Ionicons } from "@expo/vector-icons";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  registerGlobals,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { useEffect } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing } from "@/src/theme";

registerGlobals();

export type CallScreenProps = {
  url: string;
  token: string;
  mode: "audio" | "video";
  title?: string;
  onLeave: () => void;
};

export default function CallScreen({ url, token, mode, title, onLeave }: CallScreenProps) {
  useEffect(() => {
    AudioSession.startAudioSession().catch(() => {});
    return () => {
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, []);

  if (!url || !token) {
    return (
      <View style={styles.center} testID="call-screen-error">
        <Text style={styles.errText}>Missing call connection details.</Text>
        <Pressable testID="call-leave-btn" onPress={onLeave} style={styles.leaveBtn}>
          <Text style={styles.leaveText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio
      video={mode === "video"}
      onDisconnected={onLeave}
      onError={() => {}}
      style={{ flex: 1 }}
    >
      <RoomView mode={mode} title={title} onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function tileName(item: TrackReferenceOrPlaceholder): string {
  const p: any = item.participant;
  return p?.name || p?.identity || "Guest";
}

function RoomView({ mode, title, onLeave }: { mode: "audio" | "video"; title?: string; onLeave: () => void }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();

  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  const leave = async () => {
    try {
      await room.disconnect();
    } catch {
      // ignore
    }
    onLeave();
  };

  const toggleMic = () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => {});
  const toggleCam = () => localParticipant.setCameraEnabled(!isCameraEnabled).catch(() => {});
  const toggleShare = () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled).catch(() => {});

  return (
    <View style={styles.container} testID="call-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1} testID="call-title">{title || "TeamNest call"}</Text>
          <Text style={styles.sub} testID="call-participant-count">
            {mode === "video" ? "Video call" : "Audio call"} · {participants.length} in call
          </Text>
        </View>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {tracks.map((item, i) => {
          const isShare = item.source === Track.Source.ScreenShare;
          const key = isTrackReference(item)
            ? item.publication?.trackSid || `${tileName(item)}-${i}`
            : `ph-${tileName(item)}-${i}`;
          return (
            <View key={key} style={[styles.tile, isShare && styles.tileWide]} testID={`call-tile-${i}`}>
              {isTrackReference(item) ? (
                <VideoTrack trackRef={item} style={styles.video} objectFit="cover" />
              ) : (
                <View style={styles.audioTile}>
                  <View style={styles.audioAvatar}>
                    <Text style={styles.audioAvatarText}>
                      {(tileName(item)[0] || "?").toUpperCase()}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.tileLabel}>
                <Text style={styles.tileLabelText} numberOfLines={1}>
                  {tileName(item)}{isShare ? " · screen" : ""}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.controls}>
        <ControlButton testID="call-toggle-mic" icon={isMicrophoneEnabled ? "mic" : "mic-off"} active={isMicrophoneEnabled} onPress={toggleMic} />
        {mode === "video" ? (
          <ControlButton testID="call-toggle-camera" icon={isCameraEnabled ? "videocam" : "videocam-off"} active={isCameraEnabled} onPress={toggleCam} />
        ) : null}
        {Platform.OS === "android" ? (
          <ControlButton testID="call-toggle-screenshare" icon="phone-portrait" active={isScreenShareEnabled} onPress={toggleShare} />
        ) : null}
        <Pressable testID="call-leave-btn" onPress={leave} style={styles.hangup}>
          <Ionicons name="call" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function ControlButton({ testID, icon, active, onPress }: { testID: string; icon: any; active: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.ctrl, active ? styles.ctrlOn : styles.ctrlOff]}>
      <Ionicons name={icon} size={22} color={active ? "#09090b" : colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0c" },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  errText: { color: colors.textSecondary, fontSize: font.body },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: 54, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { color: colors.textPrimary, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  liveText: { color: colors.danger, fontSize: font.tiny, fontWeight: "800", letterSpacing: 1 },
  grid: { flexGrow: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.sm, justifyContent: "center" },
  tile: { width: "48%", aspectRatio: 3 / 4, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  tileWide: { width: "98%", aspectRatio: 16 / 9 },
  video: { flex: 1 },
  audioTile: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgElevated },
  audioAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceHover, alignItems: "center", justifyContent: "center" },
  audioAvatarText: { color: colors.textPrimary, fontWeight: "800", fontSize: 24 },
  tileLabel: { position: "absolute", left: 6, bottom: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  tileLabelText: { color: "#fff", fontSize: font.tiny, fontWeight: "600" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg, paddingVertical: spacing.xl, paddingBottom: 40, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  ctrl: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  ctrlOn: { backgroundColor: colors.accent },
  ctrlOff: { backgroundColor: colors.surfaceHover },
  hangup: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", transform: [{ rotate: "135deg" }] },
  leaveBtn: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 12 },
  leaveText: { color: "#fff", fontWeight: "800", fontSize: font.body },
});
