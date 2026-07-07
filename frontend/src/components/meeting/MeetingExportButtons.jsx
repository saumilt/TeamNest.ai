import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/**
 * Export-as-PDF and Export-as-DOCX action row used by the meeting summary
 * dialog. Extracted so the parent stays focused on data + state.
 */
export default function MeetingExportButtons({ onExport }) {
	return (
		<div className="border-t border-hairline pt-3 flex gap-2 flex-wrap">
			<Button
				data-testid="mtg-export-pdf"
				onClick={() => onExport("pdf")}
				variant="outline"
				size="sm"
				className="border-hairline bg-transparent hover:bg-white/5 rounded-full text-[12px] font-medium h-8 px-3"
			>
				<Download className="w-3.5 h-3.5 mr-1.5" />
				Export PDF
			</Button>
			<Button
				data-testid="mtg-export-docx"
				onClick={() => onExport("docx")}
				variant="outline"
				size="sm"
				className="border-hairline bg-transparent hover:bg-white/5 rounded-full text-[12px] font-medium h-8 px-3"
			>
				<Download className="w-3.5 h-3.5 mr-1.5" />
				Export Word
			</Button>
		</div>
	);
}
