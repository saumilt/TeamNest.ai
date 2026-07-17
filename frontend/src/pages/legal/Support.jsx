import LegalLayout from "./LegalLayout";
import { Mail, MessageSquare, Clock, BookOpen, ShieldCheck, Trash2 } from "lucide-react";

export default function Support() {
  return (
    <LegalLayout
      title="Support & Help"
      subtitle="Help · Contact"
      lastUpdated="May 2026"
    >
      <p>
        Hi 👋 — we're a small team that genuinely reads every message. Whatever
        you need help with, we'll respond fast.
      </p>

      {/* Contact tiles */}
      <div className="not-prose grid sm:grid-cols-2 gap-4 my-10">
        <a
          href="mailto:support@teamnest.ai"
          data-testid="support-email"
          className="block border border-white/10 rounded-sm p-5 hover:border-yellow-400/50 hover:bg-yellow-400/5 transition-colors"
        >
          <Mail className="w-5 h-5 text-yellow-400 mb-3" />
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">
            General support
          </div>
          <div className="text-white font-semibold">support@teamnest.ai</div>
          <div className="text-xs text-zinc-500 mt-1">Replies within 24 hours</div>
        </a>

        <a
          href="mailto:security@teamnest.ai"
          className="block border border-white/10 rounded-sm p-5 hover:border-yellow-400/50 hover:bg-yellow-400/5 transition-colors"
        >
          <ShieldCheck className="w-5 h-5 text-yellow-400 mb-3" />
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">
            Security reports
          </div>
          <div className="text-white font-semibold">security@teamnest.ai</div>
          <div className="text-xs text-zinc-500 mt-1">PGP key on request</div>
        </a>

        <a
          href="mailto:privacy@teamnest.ai"
          className="block border border-white/10 rounded-sm p-5 hover:border-yellow-400/50 hover:bg-yellow-400/5 transition-colors"
        >
          <BookOpen className="w-5 h-5 text-yellow-400 mb-3" />
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">
            Privacy / data requests
          </div>
          <div className="text-white font-semibold">privacy@teamnest.ai</div>
          <div className="text-xs text-zinc-500 mt-1">GDPR / CCPA / DPDP within 30 days</div>
        </a>

        <a
          href="mailto:legal@teamnest.ai"
          className="block border border-white/10 rounded-sm p-5 hover:border-yellow-400/50 hover:bg-yellow-400/5 transition-colors"
        >
          <MessageSquare className="w-5 h-5 text-yellow-400 mb-3" />
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">
            Legal / billing disputes
          </div>
          <div className="text-white font-semibold">legal@teamnest.ai</div>
          <div className="text-xs text-zinc-500 mt-1">Business hours, weekdays</div>
        </a>
      </div>

      <h2>Response times</h2>
      <p>
        We aim to respond to every message within these targets. Outliers
        happen on weekends and holidays.
      </p>
      <ul>
        <li>
          <strong>General support</strong> — within 24 hours
        </li>
        <li>
          <strong>Paid Pro / Team customers</strong> — within 4 business hours
        </li>
        <li>
          <strong>Security reports</strong> — initial acknowledgement within 6 hours
        </li>
        <li>
          <strong>Privacy / data requests</strong> — within 30 days as required by GDPR / CCPA / India DPDP
        </li>
      </ul>

      <h2>Common questions</h2>

      <h3>How do I cancel my subscription?</h3>
      <p>
        Open <strong>Settings → Billing → Customer Portal</strong>. Stripe will
        let you cancel, pause or switch plans. Cancellation takes effect at the
        end of the current billing cycle and you keep access until then.
      </p>

      <h3>How do I delete my account?</h3>
      <p>
        Open <strong>Settings → Profile → Delete Account</strong>, or email{" "}
        <a href="mailto:privacy@teamnest.ai">privacy@teamnest.ai</a> from the
        address registered to your account. We delete your data within 30
        days; backups within 90.
      </p>

      <h3>I think someone else got into my account</h3>
      <p>
        Reset your password from the login page, then email{" "}
        <a href="mailto:security@teamnest.ai">security@teamnest.ai</a> with the
        approximate time you noticed the issue. We'll force-revoke all your
        sessions and audit the access log.
      </p>

      <h3>Is my chat data used to train AI models?</h3>
      <p>
        No. We use the enterprise / zero-data-retention API tier of every
        provider (OpenAI, Anthropic, Google, etc.) which contractually
        prevents your messages from being used to train their models. See our{" "}
        <a href="/privacy">Privacy Policy</a> for details.
      </p>

      <h3>How do AI credits work?</h3>
      <p>
        Each AI research call deducts credits based on the model used (free
        tier ships with 300 credits / month, resets on the first of the
        calendar month). Premium models (GPT-5, Claude Opus, Gemini Pro) cost
        more credits than the default fast models. You can top up at any time
        in the Billing page.
      </p>

      <h3>I run a workspace — who can invite people?</h3>
      <p>
        Owners and admins can invite from <strong>Team Admin → Invite</strong>.
        Guest collaborators (single-chat scope) can be added by any chat member
        with permission.
      </p>

      <h2>Other ways to reach us</h2>
      <p>For postal correspondence:</p>
      <p className="not-prose font-mono text-sm text-zinc-300 leading-relaxed">
        TeamNest<br />
        1111B S Governors Ave, Suite 6433<br />
        Dover, DE 19904<br />
        United States
      </p>

      <div className="not-prose mt-12 border-t border-white/5 pt-8 flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-zinc-500">
        <Clock className="w-3.5 h-3.5" />
        Status &amp; uptime · status.teamnest.ai
        <span className="mx-2">·</span>
        <Trash2 className="w-3.5 h-3.5" />
        Data deletion · privacy@teamnest.ai
      </div>
    </LegalLayout>
  );
}
