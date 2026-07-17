import LegalLayout from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="Legal · Privacy"
      lastUpdated="May 2026"
    >
      <p>
        TeamNest (<strong>"we"</strong>, <strong>"our"</strong>, the
        <strong> "Service"</strong>) is operated by TeamNest. This Privacy
        Policy explains what information we collect, how we use it, and the
        rights you have over your data. By using TeamNest you agree to the
        practices described below.
      </p>

      <h2>1. Information we collect</h2>

      <h3>1.1 Account information</h3>
      <ul>
        <li><strong>Name, email and (optional) phone number</strong> you provide when you sign up.</li>
        <li><strong>Hashed password</strong> — we never store passwords in plain text. We use bcrypt with a per-user salt.</li>
        <li><strong>Workspace and team membership</strong>, including the role you hold in each workspace.</li>
        <li><strong>Profile photo</strong>, if you choose to upload one.</li>
      </ul>

      <h3>1.2 Content you create</h3>
      <ul>
        <li>Messages you send in chats, including text, file attachments and voice notes.</li>
        <li>AI research queries you ask, the AI model responses you receive, and any votes / saves you make on those responses.</li>
        <li>Tasks you create or are assigned.</li>
        <li>Project folders and the items you save to them.</li>
        <li>Call and meeting transcripts when live transcription is enabled by the call host.</li>
      </ul>

      <h3>1.3 Device and usage data</h3>
      <ul>
        <li>Browser type, operating system, screen size, language.</li>
        <li>IP address (used only to detect abuse and to log security events).</li>
        <li>Push notification device tokens (APNs / FCM) so we can deliver mobile push notifications.</li>
        <li>In-product event logs (e.g. "message sent", "task created") used to operate the Service and improve features. We do <strong>not</strong> sell this data.</li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To provide the core Service — auth, chat delivery, AI orchestration, task reminders, payment processing.</li>
        <li>To send transactional emails (invites, password reset, billing receipts).</li>
        <li>To send opt-in product updates. You can unsubscribe at any time.</li>
        <li>To enforce our Terms of Service and detect abuse, fraud, or violations.</li>
        <li>To respond to your support requests.</li>
      </ul>

      <h2>3. Third-party sub-processors</h2>
      <p>
        To deliver TeamNest features, we share the minimum data necessary with
        the following sub-processors. Each is bound by a written contract that
        prohibits secondary use of your data.
      </p>
      <ul>
        <li><strong>OpenAI, Anthropic, Google (Gemini), Perplexity, DeepSeek, xAI</strong> — your AI research queries and the chat messages you explicitly send to AI are transmitted to these providers to generate responses. Each provider operates a zero-data-retention API tier for enterprise use.</li>
        <li><strong>Stripe</strong> — handles all card transactions. We never see or store your card number; only a payment method ID.</li>
        <li><strong>Deepgram</strong> — processes audio for sub-second live call transcription when transcription is enabled.</li>
        <li><strong>LiveKit</strong> — relays the audio/video stream for in-app calls.</li>
        <li><strong>MongoDB Atlas, AWS, Cloudflare</strong> — infrastructure, hosting, CDN.</li>
        <li><strong>Resend / SendGrid</strong> — transactional email delivery.</li>
      </ul>

      <h2>4. Mobile permissions</h2>
      <p>The TeamNest iOS and Android apps request the following permissions:</p>
      <ul>
        <li><strong>Camera</strong> — only when you tap the camera icon to capture or share a photo.</li>
        <li><strong>Photo library</strong> — only when you tap the gallery picker.</li>
        <li><strong>Microphone</strong> — only during voice notes and audio/video calls.</li>
        <li><strong>Notifications</strong> — to deliver chat and task push notifications.</li>
        <li><strong>Face ID / Fingerprint</strong> — optional, used only to lock and unlock the app on your device.</li>
        <li><strong>Local network</strong> — to establish peer-to-peer call connections via WebRTC.</li>
      </ul>
      <p>Each permission can be revoked at any time from your device settings.</p>

      <h2>5. Data retention</h2>
      <ul>
        <li>Account, chat, task and AI data is retained for as long as your account is active.</li>
        <li>If you delete your account, we delete the underlying data within 30 days, except backups, which are purged within 90 days.</li>
        <li>Billing and tax records are retained for 7 years as required by law.</li>
        <li>Anonymized, aggregated analytics may be retained indefinitely.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>
        Depending on where you live (GDPR, UK GDPR, CCPA, PIPEDA, LGPD, India
        DPDP) you may have the right to:
      </p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Request correction or deletion of your data.</li>
        <li>Object to or restrict certain processing activities.</li>
        <li>Export your data in a portable format.</li>
        <li>Withdraw consent at any time.</li>
        <li>Lodge a complaint with your local data protection authority.</li>
      </ul>
      <p>
        To exercise any of these rights, email{" "}
        <a href="mailto:privacy@teamnest.ai">privacy@teamnest.ai</a>. We respond
        within 30 days.
      </p>

      <h2>7. Children</h2>
      <p>
        TeamNest is not directed to children under 13 (or 16 in the EU). If you
        believe a child has provided us personal data, contact us and we will
        delete it.
      </p>

      <h2>8. International data transfers</h2>
      <p>
        We process and store data in the United States and the European Union.
        Cross-border transfers rely on the EU Standard Contractual Clauses, the
        UK Addendum, and equivalent safeguards.
      </p>

      <h2>9. Security</h2>
      <p>
        We use industry-standard safeguards: TLS 1.2+ in transit, AES-256 at
        rest, bcrypt-hashed passwords, JWT-based session tokens, scoped IAM
        roles, regular penetration testing, and automated dependency
        vulnerability scans. No system is 100% secure — please report
        suspected vulnerabilities to{" "}
        <a href="mailto:security@teamnest.ai">security@teamnest.ai</a>.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        When we make material changes, we will notify you via email or in-app
        banner at least 14 days before they take effect.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions or requests? Reach us at{" "}
        <a href="mailto:privacy@teamnest.ai">privacy@teamnest.ai</a>. For postal
        mail: TeamNest, 1111B S Governors Ave Ste 6433, Dover DE 19904,
        USA.
      </p>
    </LegalLayout>
  );
}
