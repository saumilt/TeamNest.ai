/**
 * EmptyState — single-line outline illustration + title/sub/CTA.
 *
 * Pattern from the spec:
 *   - 60px outline icon (Lucide stroke 1.5)
 *   - title 16/22 600
 *   - sub 13/18 dim
 *   - one primary CTA
 */
import { Button } from "@/components/ui/button";

export default function EmptyState({ icon: Icon, title, sub, cta, onCta, ctaTestid }) {
	return (
		<div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
			{Icon && (
				<div className="mb-5 text-ink-mute">
					<Icon className="w-[60px] h-[60px]" strokeWidth={1.5} />
				</div>
			)}
			<h3 className="text-[16px] leading-[22px] font-semibold text-ink mb-1.5">{title}</h3>
			{sub && (
				<p className="text-[13px] leading-[18px] text-ink-dim max-w-[280px]">{sub}</p>
			)}
			{cta && (
				<Button
					data-testid={ctaTestid}
					onClick={onCta}
					className="mt-6 h-12 px-5 rounded-2xl bg-brand text-black hover:bg-brand-deep font-semibold"
				>
					{cta}
				</Button>
			)}
		</div>
	);
}
