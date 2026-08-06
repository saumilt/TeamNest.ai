import { useRef, useState } from "react";
import { ImagePlus, X, Check } from "lucide-react";
import Avatar from "@/components/ui-v2/Avatar";
import { GROUP_ICONS, GROUP_COLORS, groupAvatarProps } from "@/components/web/groupAvatarPresets";

/* Downscale an uploaded image to a small square data URL so group avatars stay
   tiny (they ride along in chat list payloads). */
function fileToAvatarDataUrl(file, max = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = max;
        canvas.height = max;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, max, max);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * GroupAvatarPicker — choose a preset icon+color OR upload a photo.
 * Controlled: `value` = { avatar_icon, avatar_color, avatar_url }, onChange(next).
 */
export default function GroupAvatarPicker({ value = {}, name = "Group", onChange }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => onChange?.({ ...value, ...patch });
  const activeColor = value.avatar_color || GROUP_COLORS[0];

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const url = await fileToAvatarDataUrl(file);
      set({ avatar_url: url, avatar_icon: null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="group-avatar-picker">
      <div className="flex items-center gap-4">
        <Avatar {...groupAvatarProps(value)} name={name} size={64} />
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="group-avatar-upload"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/12 text-ink-dim hover:text-ink hover:border-white/25 text-sm disabled:opacity-50"
          >
            <ImagePlus className="w-4 h-4" /> {busy ? "…" : "Upload photo"}
          </button>
          {(value.avatar_url || value.avatar_icon) && (
            <button
              type="button"
              data-testid="group-avatar-clear"
              onClick={() => set({ avatar_url: null, avatar_icon: null, avatar_color: null })}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/12 text-ink-dim hover:text-ink hover:border-white/25 text-sm"
            >
              <X className="w-4 h-4" /> Clear
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
        </div>
      </div>

      {!value.avatar_url && (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(GROUP_ICONS).map(([key, Icon]) => {
              const active = value.avatar_icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`group-icon-${key}`}
                  onClick={() => set({ avatar_icon: key, avatar_color: activeColor, avatar_url: null })}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${
                    active ? "border-ai bg-ai-tint/20" : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <Icon className="w-4 h-4 text-ink-dim" />
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {GROUP_COLORS.map((c) => {
              const active = activeColor === c;
              return (
                <button
                  key={c}
                  type="button"
                  data-testid={`group-color-${c}`}
                  onClick={() => set({ avatar_color: c, avatar_icon: value.avatar_icon || "users" })}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: c }}
                >
                  {active && <Check className="w-3.5 h-3.5 text-black/80" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
