/** Tiny atomic web primitives — used across marketing pages. */

export function Eyebrow({ children, className = "", tone = "default" }) {
  const tones = {
    default: "text-[var(--w-text-mute)]",
    brand: "text-[var(--w-brand)]",
    ai: "text-[var(--w-ai)]",
    green: "text-[var(--w-green)]",
  };
  return (
    <div className={`text-[12px] leading-4 font-bold uppercase tracking-[0.14em] ${tones[tone] || tones.default} ${className}`}>
      {children}
    </div>
  );
}

export function Pill({ children, tone = "default", className = "", icon: Icon }) {
  const tones = {
    default: "border-[var(--w-hairline)] text-[var(--w-text-dim)] bg-transparent",
    brand: "border-transparent text-black bg-[var(--w-brand)]",
    brandTint: "border-[var(--w-brand)]/30 text-[var(--w-brand)] bg-[var(--w-brand-tint)]",
    ai: "border-[var(--w-ai)]/30 text-[var(--w-ai)] bg-[var(--w-ai-tint)]",
    green: "border-[var(--w-green)]/30 text-[var(--w-green)] bg-[var(--w-green)]/10",
    surface: "border-[var(--w-hairline)] text-[var(--w-text)] bg-[var(--w-surface)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[12px] font-medium leading-4 ${tones[tone] || tones.default} ${className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </span>
  );
}

export function PrimaryButton({ children, as: Tag = "button", className = "", ...rest }) {
  return (
    <Tag
      className={`inline-flex items-center justify-center gap-2 h-12 px-6 rounded-[12px] bg-[var(--w-brand)] text-black font-semibold text-[15px] hover:brightness-95 active:scale-[0.97] transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--w-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--w-bg)] ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function GhostButton({ children, as: Tag = "button", className = "", ...rest }) {
  return (
    <Tag
      className={`inline-flex items-center justify-center gap-2 h-12 px-6 rounded-[12px] border border-[var(--w-hairline)] bg-transparent text-[var(--w-text)] font-semibold text-[15px] hover:bg-[var(--w-surface)] hover:border-[var(--w-hairline-strong)] active:scale-[0.97] transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--w-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--w-bg)] ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, className = "" }) {
  return (
    <h2
      className={`text-[32px] sm:text-[40px] leading-[1.1] font-bold tracking-[-0.02em] text-[var(--w-text)] ${className}`}
      style={{ textWrap: "balance" }}
    >
      {children}
    </h2>
  );
}

export function SectionSub({ children, className = "" }) {
  return (
    <p className={`text-[17px] leading-7 text-[var(--w-text-dim)] max-w-[60ch] ${className}`} style={{ textWrap: "pretty" }}>
      {children}
    </p>
  );
}

export function HairlineDivider({ className = "" }) {
  return <div className={`h-px w-full bg-[var(--w-hairline)] ${className}`} />;
}

export function LogoMark({ size = 32 }) {
  return (
    <div
      className="rounded-[8px] bg-[var(--w-brand)] flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="text-black font-black tracking-tight" style={{ fontSize: size * 0.44 }}>TN</span>
    </div>
  );
}

export function Wordmark({ size = "md" }) {
  const sizes = { sm: "text-[15px]", md: "text-[18px]", lg: "text-[22px]" };
  return (
    <span className={`font-bold tracking-tight text-[var(--w-text)] ${sizes[size]}`}>
      teamnest<span className="text-[var(--w-brand)]">.ai</span>
    </span>
  );
}
