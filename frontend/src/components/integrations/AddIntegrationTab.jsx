import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Zap } from "lucide-react";

/** Tab: configure a new integration (incoming webhook or saved API fetch). */
export default function AddIntegrationTab({
  type, setType, name, setName, url, setUrl, onCreate,
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="label-mono mb-2">TYPE</div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger data-testid="integration-type" className="bg-[#121214] border-white/10 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#121214] border-white/10">
            <SelectItem value="incoming_webhook">Incoming webhook (Zapier &rarr; chat)</SelectItem>
            <SelectItem value="api_fetch">API fetch endpoint (saved URL)</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-[11px] text-zinc-500 mt-2">
          {type === "incoming_webhook" &&
            "We'll generate a unique URL. Anyone with that URL can POST JSON to drop messages into this chat."}
          {type === "api_fetch" &&
            "Save a URL you can fetch on-demand. We'll GET / POST it and post the response in chat."}
        </div>
      </div>

      <div>
        <div className="label-mono mb-2">NAME</div>
        <Input
          data-testid="integration-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Stripe new-customer trigger"
          className="bg-[#121214] border-white/10 rounded-sm"
        />
      </div>

      {type === "api_fetch" && (
        <div>
          <div className="label-mono mb-2">URL</div>
          <Input
            data-testid="integration-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/v1/leads"
            className="bg-[#121214] border-white/10 rounded-sm"
          />
        </div>
      )}

      <Button
        data-testid="integration-create"
        onClick={onCreate}
        className="w-full bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-xs tracking-widest h-10"
      >
        <Zap className="w-3.5 h-3.5 mr-1.5" />
        Create integration
      </Button>
    </div>
  );
}
