import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plug } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import IntegrationsListTab from "@/components/integrations/IntegrationsListTab";
import AddIntegrationTab from "@/components/integrations/AddIntegrationTab";
import QuickApiFetchTab from "@/components/integrations/QuickApiFetchTab";

export default function IntegrationsDialog({ open, onOpenChange, chatId, chatName }) {
  const [list, setList] = useState([]);
  const [tab, setTab] = useState("list");

  const [type, setType] = useState("incoming_webhook");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const [fetchUrl, setFetchUrl] = useState("");
  const [fetchMethod, setFetchMethod] = useState("GET");
  const [fetchLabel, setFetchLabel] = useState("");
  const [fetching, setFetching] = useState(false);

  const load = () => {
    api.get(`/chats/${chatId}/integrations`).then(({ data }) => setList(data));
  };

  useEffect(() => {
    if (open && chatId) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatId]);

  const create = async () => {
    if (!name) return toast.error("Name required");
    if ((type === "outgoing_webhook" || type === "api_fetch") && !url) {
      return toast.error("URL required for this type");
    }
    try {
      await api.post(`/chats/${chatId}/integrations`, {
        type,
        name,
        config: type === "incoming_webhook" ? {} : { url },
      });
      toast.success("Integration created");
      setName("");
      setUrl("");
      load();
      setTab("list");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    }
  };

  const remove = async (id) => {
    await api.delete(`/integrations/${id}`);
    toast.success("Integration removed");
    load();
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed — long-press to copy manually");
    }
  };

  const runFetch = async () => {
    if (!fetchUrl) return toast.error("URL required");
    setFetching(true);
    try {
      await api.post(`/chats/${chatId}/api-fetch`, {
        url: fetchUrl,
        method: fetchMethod,
        label: fetchLabel || undefined,
      });
      toast.success("Fetched · posted to chat");
      setFetchUrl("");
      setFetchLabel("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Fetch failed");
    } finally {
      setFetching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-2xl"
        data-testid="integrations-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight flex items-center gap-2">
            <Plug className="w-5 h-5 text-yellow-400" />
            Chat integrations
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 ml-2">
              · {chatName || "this chat"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#121214] border border-white/10 rounded-sm" data-testid="integrations-tabs">
            <TabsTrigger value="list" className="rounded-sm font-mono uppercase text-[10px] tracking-widest">Active</TabsTrigger>
            <TabsTrigger value="add" className="rounded-sm font-mono uppercase text-[10px] tracking-widest">Add new</TabsTrigger>
            <TabsTrigger value="fetch" className="rounded-sm font-mono uppercase text-[10px] tracking-widest">Quick API fetch</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4 space-y-2">
            <IntegrationsListTab list={list} onRemove={remove} onCopy={copy} />
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <AddIntegrationTab
              type={type} setType={setType}
              name={name} setName={setName}
              url={url} setUrl={setUrl}
              onCreate={create}
            />
          </TabsContent>

          <TabsContent value="fetch" className="mt-4">
            <QuickApiFetchTab
              fetchUrl={fetchUrl} setFetchUrl={setFetchUrl}
              fetchMethod={fetchMethod} setFetchMethod={setFetchMethod}
              fetchLabel={fetchLabel} setFetchLabel={setFetchLabel}
              fetching={fetching}
              onRun={runFetch}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
