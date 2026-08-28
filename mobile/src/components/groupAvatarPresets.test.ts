import {
  groupAvatarProps,
  GROUP_ICONS,
  GROUP_COLORS,
} from "./groupAvatarPresets";

describe("groupAvatarProps", () => {
  it("returns an empty object when there is no chat", () => {
    expect(groupAvatarProps(null)).toEqual({});
    expect(groupAvatarProps(undefined)).toEqual({});
  });

  it("prefers a photo (avatar_url) over an icon", () => {
    expect(groupAvatarProps({ avatar_url: "https://x/y.png" })).toEqual({
      src: "https://x/y.png",
    });
  });

  it("maps a known icon key to an Ionicon name + the given color", () => {
    const props = groupAvatarProps({
      avatar_icon: "rocket",
      avatar_color: "#123456",
    });
    expect(props.icon).toBe(GROUP_ICONS.rocket);
    expect(props.color).toBe("#123456");
  });

  it("falls back to the first preset color when none is provided", () => {
    const props = groupAvatarProps({ avatar_icon: "star" });
    expect(props.color).toBe(GROUP_COLORS[0]);
  });

  it("returns an empty object for an unknown icon key", () => {
    expect(groupAvatarProps({ avatar_icon: "not-a-real-icon" })).toEqual({});
  });
});
