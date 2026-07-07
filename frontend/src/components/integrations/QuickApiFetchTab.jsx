import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

/** Tab: ad-hoc one-shot API fetch — pulls a URL and posts the response into chat. */
export default function QuickApiFetchTab({
  fetchUrl, setFetchUrl,
  fetchMethod, setFetchMethod,
  fetchLabel, setFetchLabel,
  fetching, onRun,
}) {
  return (
    <div className="space-y-4">
      <div className="text-[11px] text-zinc-500 leading-relaxed">
        Pull data from any public HTTP endpoint and post the response into this chat. Great for one-off lookups (e.g., CoinGecko prices, GitHub repo stats, your own API).
      </div>
      <div className="grid grid-cols-[100px_1fr] gap-2">
        <Select value={fetchMethod} onValueChange={setFetchMethod}>
          <SelectTrigger className="bg-[#121214] border-white/10 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#121214] border-white/10">
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
          </SelectContent>
        </Select>
        <Input
          data-testid="apifetch-url"
          value={fetchUrl}
          onChange={(e) => setFetchUrl(e.target.value)}
          placeholder="https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
          className="bg-[#121214] border-white/10 rounded-sm"
        />
      </div>
      <Input
        data-testid="apifetch-label"
        value={fetchLabel}
        onChange={(e) => setFetchLabel(e.target.value)}
        placeholder="Label (optional) — e.g., 'BTC price'"
        className="bg-[#121214] border-white/10 rounded-sm"
      />
      <Button
        data-testid="apifetch-run"
        onClick={onRun}
        disabled={fetching || !fetchUrl}
        className="w-full bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-xs tracking-widest h-10"
      >
        <Globe className="w-3.5 h-3.5 mr-1.5" />
        {fetching ? "Fetching…" : "Fetch & post to chat"}
      </Button>
    </div>
  );
}
