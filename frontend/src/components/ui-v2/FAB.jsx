/**
 * FAB — 56px floating action button anchored bottom-right above the tab bar.
 */
export default function FAB({
	icon: Icon,
	onClick,
	testid = "fab",
	label = "Action",
	className = "",
}) {
	return (
		<button
			data-testid={testid}
			onClick={onClick}
			aria-label={label}
			className={`fixed right-4 z-30 w-14 h-14 rounded-full bg-brand text-black shadow-[0_8px_24px_-4px_rgba(255,210,63,0.45)] flex items-center justify-center active:scale-95 transition-transform md:hidden bottom-[calc(env(safe-area-inset-bottom)+84px)] ${className}`}
		>
			<Icon className="w-6 h-6" strokeWidth={2.2} />
		</button>
	);
}
