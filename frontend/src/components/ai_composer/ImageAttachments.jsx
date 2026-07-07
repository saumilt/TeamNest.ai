/* Photo attachment chips shown when user is asking AI about images. */
export default function ImageAttachments({ attachments }) {
        if (!attachments || attachments.length === 0) return null;
        return (
                <div className="flex flex-wrap gap-2 mb-3" data-testid="ai-image-attachments">
                        {attachments.map((a) => (
                                <div
                                        key={a.id}
                                        className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-400/30 text-purple-200 px-2.5 h-7 rounded-sm text-[11px] font-mono uppercase tracking-widest"
                                >
                                        <span>📷</span>
                                        <span className="truncate max-w-[160px]">{a.filename}</span>
                                </div>
                        ))}
                        <span className="text-[10px] text-zinc-500 font-mono self-center">
                                Vision-capable models will see these images.
                        </span>
                </div>
        );
}
