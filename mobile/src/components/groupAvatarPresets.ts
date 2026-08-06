import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

// Mirrors the web preset keys (frontend/src/components/web/groupAvatarPresets.jsx)
// so a group created on either surface renders a matching glyph on the other.
export const GROUP_ICONS: Record<string, IoniconName> = {
  users: "people",
  rocket: "rocket",
  grad: "school",
  briefcase: "briefcase",
  idea: "bulb",
  heart: "heart",
  star: "star",
  flag: "flag",
  code: "code-slash",
  palette: "color-palette",
  music: "musical-notes",
  camera: "camera",
  globe: "globe",
  coffee: "cafe",
  zap: "flash",
  book: "book",
};

export const GROUP_COLORS = [
  "#FFD23F", "#B794F4", "#34D399", "#60A5FA",
  "#F472B6", "#FB923C", "#22D3EE", "#A3E635",
];

// Map a chat doc → props for <Avatar>. Photo wins over preset icon+color;
// otherwise return {} so the Avatar falls back to name initials.
export function groupAvatarProps(
  chat: any,
): { src?: string; icon?: IoniconName; color?: string } {
  if (!chat) return {};
  if (chat.avatar_url) return { src: chat.avatar_url };
  const key = chat.avatar_icon;
  if (key && GROUP_ICONS[key]) {
    return { icon: GROUP_ICONS[key], color: chat.avatar_color || GROUP_COLORS[0] };
  }
  return {};
}
