import { Link } from "react-router-dom";
import { Sparkles, MessageSquare, ListChecks, Phone, Folder, Plug, ArrowRight } from "lucide-react";
import SeoHelmet from "@/components/web/SeoHelmet";
import { Eyebrow, SectionTitle, SectionSub, PrimaryButton } from "@/components/web/atoms";
import {
  SixModelStrip,
  GroupChatMock,
  TaskCardMock,
  CallTranscriptMock,
  FolderTabsMock,
} from "@/components/web/mocks";

function PillarSection({ id, eyebrow, title, sub, mock, bullets, flip = false }) {
  return (
    <section id={id} className="py-20 md:py-[120px] border-b border-[var(--w-hairline)] last:border-b-0">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-10 items-center ${flip ? "lg:[&>div:first-child]:order-2" : ""}`}>
          <div className="lg:col-span-5">
            <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
            <SectionTitle className="!text-[32px] sm:!text-[36px] mb-4 max-w-[18ch]">
              {title}
            </SectionTitle>
            <SectionSub className="mb-6">{sub}</SectionSub>
            <ul className="space-y-2.5">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[15px] leading-6 text-[var(--w-text)]">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--w-brand-tint)] text-[var(--w-brand)] shrink-0 mt-1">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6.5L4.5 9L10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-7">
            <div className="rounded-[20px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-6 md:p-8">
              {mock}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function WebProduct() {
  return (
    <>
      <SeoHelmet
        title="Product · TeamNest.ai"
        description="AI-native team chat with side-by-side AI compare, tasks, calls with live captions, and project folders. Built for research-heavy teams."
        path="/product"
      />

      <section className="pt-16 pb-12">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center">
          <Eyebrow className="mb-3">Product</Eyebrow>
          <SectionTitle className="!text-[44px] sm:!text-[56px] mb-5 max-w-[22ch] mx-auto">
            One workspace. Six AIs. Your whole team.
          </SectionTitle>
          <SectionSub className="mx-auto text-center mb-8">
            Group chat, AI threads, tasks, calls, and project folders — built around how research-heavy teams actually make decisions.
          </SectionSub>
          <PrimaryButton as={Link} to="/login?demo=1" data-testid="web-product-cta">
            Try the demo <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
        </div>
      </section>

      <PillarSection
        id="chat"
        eyebrow="Group chat"
        title="Chat that knows your team."
        sub="Direct messages, group chats, project chats. Every message can mention people, tasks, or AI — and every conversation can become a folder."
        bullets={[
          "@mention people, files, and previous decisions",
          "Pin messages, react with custom emoji, edit in place",
          "Read receipts, typing indicators, presence",
        ]}
        mock={<GroupChatMock />}
      />

      <PillarSection
        id="ai-compare"
        eyebrow="AI Compare"
        title="One question, six answers."
        sub="Ask any AI from any chat. Or compare 3 or all 6 models side-by-side, then auto-synthesize the best answer."
        bullets={[
          "GPT-4o, Claude Sonnet, Gemini Pro, DeepSeek, Perplexity, Grok",
          "Streaming answers — see all six type in parallel",
          "One-click 'synthesize best answer' across all columns",
          "Save the winner to a project folder",
        ]}
        mock={
          <div className="-mx-2 sm:-mx-4">
            <SixModelStrip />
          </div>
        }
        flip
      />

      <PillarSection
        id="tasks"
        eyebrow="Tasks"
        title="Decisions become tasks."
        sub="Type @task in any message and TeamNest creates a task with an assignee, due date, and priority — automatically inferred from the conversation."
        bullets={[
          "Inline task chips render in the message stream",
          "Auto-assign, auto-prioritise, auto-remind",
          "Group by chat, project, assignee, or due date",
        ]}
        mock={<TaskCardMock />}
      />

      <PillarSection
        id="calls"
        eyebrow="Calls"
        title="Calls with live captions."
        sub="Audio, video, and screen-share calls. Real-time transcription with speaker tags. AI auto-summary the moment the call ends."
        bullets={[
          "Live transcript pinned to the side of the call window",
          "Speaker labelling powered by Deepgram",
          "Auto-summary + extracted action items posted to the chat",
        ]}
        mock={<CallTranscriptMock />}
        flip
      />

      <PillarSection
        id="folders"
        eyebrow="Project folders"
        title="One folder for every project."
        sub="Group chats, AI threads, tasks, files, decisions — all under one folder. Slice your workspace however your team thinks."
        bullets={[
          "Tabs: Overview, Chats, Research, Tasks, Files",
          "Drag any message, AI answer, or task into a folder",
          "Folder-scoped search across every artifact",
        ]}
        mock={<FolderTabsMock />}
      />

      <PillarSection
        id="integrations"
        eyebrow="Integrations"
        title="Plugs into what you already use."
        sub="Stripe for billing. Deepgram for transcription. LiveKit for calls. Bring your own OpenAI / Anthropic / Google keys on Enterprise."
        bullets={[
          "Native iOS + Android apps via Capacitor",
          "PWA install on any modern browser",
          "Email-based magic links + Google login",
        ]}
        mock={
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "Stripe", icon: Plug },
              { name: "LiveKit", icon: Phone },
              { name: "Deepgram", icon: MessageSquare },
              { name: "Capacitor", icon: Folder },
            ].map((i) => (
              <div key={i.name} className="rounded-[12px] border border-[var(--w-hairline)] bg-[var(--w-surface-2)] p-4 flex items-center gap-3">
                <i.icon className="w-5 h-5 text-[var(--w-brand)]" />
                <div>
                  <div className="text-[14px] font-semibold text-[var(--w-text)]">{i.name}</div>
                  <div className="text-[11px] text-[var(--w-text-mute)]">Wired in</div>
                </div>
              </div>
            ))}
          </div>
        }
        flip
      />

      <section className="bg-[var(--w-bg-2)] py-20 md:py-[120px]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center">
          <Eyebrow className="mb-3">Get started</Eyebrow>
          <SectionTitle className="mb-5 max-w-[22ch] mx-auto">
            Spin up a workspace in under a minute.
          </SectionTitle>
          <PrimaryButton as={Link} to="/login?demo=1" data-testid="web-product-end-cta">
            Try the demo <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
        </div>
      </section>
    </>
  );
}
