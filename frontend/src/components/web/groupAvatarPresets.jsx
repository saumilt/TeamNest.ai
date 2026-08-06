import {
  Users, Rocket, GraduationCap, Briefcase, Lightbulb, Heart, Star, Flag,
  Code, Palette, Music, Camera, Globe, Coffee, Zap, BookOpen,
} from "lucide-react";

/* Preset group-avatar icons + colors. Shared by the picker and every render
   site so a stored `avatar_icon` key always resolves to the same glyph. */
export const GROUP_ICONS = {
  users: Users,
  rocket: Rocket,
  grad: GraduationCap,
  briefcase: Briefcase,
  idea: Lightbulb,
  heart: Heart,
  star: Star,
  flag: Flag,
  code: Code,
  palette: Palette,
  music: Music,
  camera: Camera,
  globe: Globe,
  coffee: Coffee,
  zap: Zap,
  book: BookOpen,
};

export const GROUP_COLORS = [
  "#FFD23F", "#B794F4", "#34D399", "#60A5FA",
  "#F472B6", "#FB923C", "#22D3EE", "#A3E635",
];

/** Map a chat doc → props for the shared <Avatar>. Photo wins over icon+color;
    otherwise fall back to initials of the chat name. */
export function groupAvatarProps(chat) {
  if (!chat) return {};
  if (chat.avatar_url) return { src: chat.avatar_url };
  if (chat.avatar_icon && GROUP_ICONS[chat.avatar_icon]) {
    return { icon: GROUP_ICONS[chat.avatar_icon], color: chat.avatar_color || GROUP_COLORS[0] };
  }
  return {};
}
