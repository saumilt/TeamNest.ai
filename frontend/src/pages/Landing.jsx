import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowRight, Sparkles, Loader2, ChevronLeft } from "lucide-react";
import { isInviteOnly, useLaunchConfig } from "@/hooks/useLaunchConfig";

/**
 * Welcome / Sign-in (the only screen besides You where the wordmark lives).
 *
 * Visual spec:
 *   - centered TN logo (56px), wordmark "teamnest.ai", micro caps "AI-NATIVE TEAM COMMS"
 *   - headline 24/30 700: "Chat with your team — and 6 AIs."
 *   - sub 14/22 dim: tagline
 *   - 3 feature pills
 *   - primary CTA (52h amber): "Continue with email" → form sheet
 *   - secondary ghost buttons (Apple / Google) — disabled in v1, kept for layout
 *   - bottom link to log in
 *   - background: deep bg + soft amber radial glow behind logo
 */
export default function Landing() {
	const { login, signup, demoLogin } = useAuth();
	const nav = useNavigate();
	const [step, setStep] = useState("intro"); // "intro" | "form"
	const [mode, setMode] = useState("login");
	const [form, setForm] = useState({ name: "", email: "", password: "" });
	const [busy, setBusy] = useState(false);

	const submit = async (e) => {
		e.preventDefault();
		setBusy(true);
		try {
			if (mode === "login") await login(form.email, form.password);
			else await signup(form.name, form.email, form.password);
			nav("/chats");
		} catch (err) {
			toast.error(err?.response?.data?.detail || "Could not sign in");
		} finally {
			setBusy(false);
		}
	};

	const onDemo = async () => {
		setBusy(true);
		try {
			await demoLogin();
			nav("/chats");
		} catch {
			toast.error("Demo login failed");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="relative min-h-[100dvh] bg-bg text-ink overflow-hidden">
			{/* Soft amber radial glow behind the logo */}
			<div
				className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"
				style={{
					width: 600,
					height: 600,
					background: "radial-gradient(circle, rgba(255,210,63,0.10) 0%, rgba(255,210,63,0) 60%)",
					filter: "blur(8px)",
				}}
			/>

			{step === "intro" ? (
				<IntroPane
					onPrimary={() => setStep("form")}
					onDemo={onDemo}
					busy={busy}
				/>
			) : (
				<FormPane
					mode={mode}
					onModeChange={setMode}
					form={form}
					onForm={setForm}
					onSubmit={submit}
					busy={busy}
					onBack={() => setStep("intro")}
				/>
			)}
		</div>
	);
}

function BrandLockup() {
	return (
		<div className="flex flex-col items-center">
			<div className="w-14 h-14 rounded-2xl bg-brand text-black flex items-center justify-center font-bold text-xl tracking-tight shadow-[0_6px_24px_-4px_rgba(255,210,63,0.5)]">
				TN
			</div>
			<div className="mt-3 text-[18px] font-bold tracking-tight">
				teamnest<span className="text-brand">.ai</span>
			</div>
			<div className="mt-1.5 text-[11px] tracking-[0.08em] uppercase font-semibold text-ink-mute">
				AI-native team comms
			</div>
		</div>
	);
}

function IntroPane({ onPrimary, onDemo, busy }) {
	const launchCfg = useLaunchConfig();
	const inviteGated = isInviteOnly(launchCfg);
	return (
		<div className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-between px-6 pt-16 pb-10">
			<BrandLockup />

			<div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
				<h1 className="text-[24px] leading-[30px] font-bold tracking-[-0.01em] text-ink text-center mb-3">
					Chat with your team —
					<br />
					and 6 AIs.
				</h1>
				<p className="text-[14px] leading-[22px] text-ink-dim text-center max-w-[300px] mb-6">
					Ask GPT, Claude, Gemini, DeepSeek, Perplexity, Grok the same question.
					Compare answers. Save research. Get things done.
				</p>

				<div className="flex flex-wrap gap-2 justify-center">
					{["Group chat", "6 AI models side-by-side", "Decisions → tasks"].map((p) => (
						<span
							key={p}
							className="inline-flex items-center px-3 h-7 rounded-full bg-surface text-[12px] text-ink-dim border border-hairline"
						>
							{p}
						</span>
					))}
				</div>
			</div>

			<div className="w-full max-w-md space-y-3">
				<Button
					data-testid="welcome-continue-btn"
					onClick={onPrimary}
					disabled={busy}
					className="w-full h-[52px] rounded-2xl bg-brand text-black hover:bg-brand-deep text-[16px] font-semibold"
				>
					Continue with email
					<ArrowRight className="w-4 h-4 ml-1.5" />
				</Button>

				{!inviteGated && (
					<button
						data-testid="demo-login-btn"
						onClick={onDemo}
						disabled={busy}
						className="w-full h-[48px] rounded-2xl bg-transparent border border-hairline text-ink-dim hover:text-ink hover:bg-white/[0.03] text-[14px] font-medium flex items-center justify-center gap-2 transition-colors"
					>
						{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-brand" />}
						Try demo workspace
					</button>
				)}
				{inviteGated && (
					<div className="flex gap-2" data-testid="landing-invite-ctas">
						<Link to="/invite" data-testid="landing-enter-code"
							className="flex-1 h-[48px] rounded-2xl border border-hairline text-ink-dim hover:text-ink text-[14px] font-medium flex items-center justify-center">
							Enter invite code
						</Link>
						<Link to="/waitlist" data-testid="landing-join-waitlist"
							className="flex-1 h-[48px] rounded-2xl border border-amber-400/30 text-amber-300 hover:bg-amber-400/10 text-[14px] font-medium flex items-center justify-center">
							Join waitlist
						</Link>
					</div>
				)}

				<div className="pt-2 text-center text-[12px] text-ink-mute">
					By continuing you agree to our{" "}
					<Link to="/terms" className="text-ink-dim hover:text-brand">Terms</Link>
					{" "}and{" "}
					<Link to="/privacy" className="text-ink-dim hover:text-brand">Privacy</Link>.
				</div>
			</div>
		</div>
	);
}

function FormPane({ mode, onModeChange, form, onForm, onSubmit, busy, onBack }) {
	return (
		<div className="relative z-10 min-h-[100dvh] flex flex-col px-6 pt-6 pb-10">
			<button
				type="button"
				onClick={onBack}
				className="self-start -ml-2 p-2 rounded-full text-ink-dim hover:text-ink hover:bg-white/[0.04]"
			>
				<ChevronLeft className="w-5 h-5" />
			</button>

			<div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto">
				<BrandLockup />
				<h1 className="mt-8 text-[24px] leading-[30px] font-bold tracking-[-0.01em] text-center">
					{mode === "login" ? "Welcome back." : "Create your account."}
				</h1>
				<p className="mt-2 text-[14px] text-ink-dim text-center">
					{mode === "login" ? "Sign in to continue." : "It only takes a minute."}
				</p>

				<div className="mt-6 inline-flex bg-surface-2 rounded-full p-1">
					<button
						type="button"
						data-testid="auth-tab-login"
						onClick={() => onModeChange("login")}
						className={`px-4 h-9 rounded-full text-sm font-medium transition-colors ${
							mode === "login" ? "bg-ink text-black" : "text-ink-dim"
						}`}
					>
						Log in
					</button>
					<button
						type="button"
						data-testid="auth-tab-signup"
						onClick={() => onModeChange("signup")}
						className={`px-4 h-9 rounded-full text-sm font-medium transition-colors ${
							mode === "signup" ? "bg-ink text-black" : "text-ink-dim"
						}`}
					>
						Sign up
					</button>
				</div>
			</div>

			<form onSubmit={onSubmit} className="w-full max-w-md mx-auto space-y-3">
				{mode === "signup" && (
					<Input
						data-testid="auth-name"
						placeholder="Your name"
						value={form.name}
						onChange={(e) => onForm({ ...form, name: e.target.value })}
						required
						className="h-12 bg-surface-2 border-hairline rounded-2xl text-[15px] px-4"
					/>
				)}
				<Input
					data-testid="auth-email"
					type="email"
					placeholder="Email"
					value={form.email}
					onChange={(e) => onForm({ ...form, email: e.target.value })}
					required
					autoComplete="email"
					className="h-12 bg-surface-2 border-hairline rounded-2xl text-[15px] px-4"
				/>
				<Input
					data-testid="auth-password"
					type="password"
					placeholder="Password"
					value={form.password}
					onChange={(e) => onForm({ ...form, password: e.target.value })}
					required
					autoComplete={mode === "login" ? "current-password" : "new-password"}
					className="h-12 bg-surface-2 border-hairline rounded-2xl text-[15px] px-4"
				/>
				<Button
					data-testid="auth-submit"
					type="submit"
					disabled={busy}
					className="w-full h-[52px] rounded-2xl bg-brand text-black hover:bg-brand-deep text-[16px] font-semibold mt-2"
				>
					{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === "login" ? "Log in" : "Create account")}
				</Button>
			</form>
		</div>
	);
}
