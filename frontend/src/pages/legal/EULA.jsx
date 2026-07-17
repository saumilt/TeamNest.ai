import LegalLayout from "./LegalLayout";

export default function EULA() {
  return (
    <LegalLayout
      title="End User License Agreement"
      subtitle="Legal · EULA"
      lastUpdated="February 2026"
    >
      <p>
        This End User License Agreement (<strong>"EULA"</strong>,
        <strong> "Agreement"</strong>) is a binding contract between you
        (<strong>"you"</strong>, <strong>"User"</strong>) and TeamNest
        (<strong>"TeamNest"</strong>, <strong>"we"</strong>,
        <strong> "our"</strong>). It governs your access to and use of the
        TeamNest software, mobile applications, websites, APIs, AI features,
        and any related services (collectively, the <strong>"Software"</strong>).
        By creating an account, downloading the app, or using the Software in
        any form you agree to be bound by this EULA. If you do not agree, do
        not install, access, or use the Software.
      </p>

      <h2>1. License Grant</h2>
      <p>
        Subject to your continued compliance with this EULA and payment of any
        applicable fees, TeamNest grants you a limited, non-exclusive,
        non-transferable, non-sublicensable, revocable license to install and
        use the Software for your personal or internal business purposes. This
        license does not transfer any ownership rights to you.
      </p>

      <h3>1.1 Permitted Use</h3>
      <ul>
        <li>Use the Software through the official TeamNest web, iOS, or Android clients.</li>
        <li>Create, manage, and collaborate within the workspaces you own or are invited to.</li>
        <li>Submit prompts to the AI features and use the resulting AI Output in your work product, subject to Section 5.</li>
        <li>Access the Software via published TeamNest APIs within the documented rate and use limits.</li>
      </ul>

      <h3>1.2 Reservation of Rights</h3>
      <p>
        All right, title, and interest in and to the Software, including all
        intellectual property rights, remain the exclusive property of TeamNest
        and its licensors. No license is granted by implication, estoppel, or
        otherwise except as expressly stated in this EULA.
      </p>

      <h2>2. Restrictions on Use</h2>
      <p>You agree NOT to, and not to enable any third party to:</p>
      <ul>
        <li>Copy, modify, translate, adapt, or create derivative works of the Software.</li>
        <li>Reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, algorithms, model weights, or trade secrets of the Software, except to the extent expressly permitted by applicable law.</li>
        <li>Sell, sublicense, rent, lease, distribute, or otherwise commercially exploit the Software or AI Output as a stand-alone service that competes with TeamNest.</li>
        <li>Remove, obscure, or alter any proprietary notices, branding, or watermarks.</li>
        <li>Use the Software to develop, train, or improve any competing artificial intelligence, large language model, foundation model, or machine-learning system.</li>
        <li>Scrape, crawl, or use automated means to extract data from the Software beyond what is permitted by our public APIs.</li>
        <li>Exceed published rate limits or attempt to bypass usage, credit, or billing controls.</li>
        <li>Use the Software in any way that violates applicable laws, regulations, export controls, or third-party rights.</li>
      </ul>

      <h2>3. Acceptable Use Policy</h2>
      <p>
        You may not use the Software, AI features, or AI Employees to generate,
        store, or distribute content that:
      </p>
      <ul>
        <li>Promotes violence, terrorism, self-harm, or child sexual abuse material.</li>
        <li>Constitutes hate speech, harassment, or discrimination on the basis of a protected characteristic.</li>
        <li>Infringes any copyright, trademark, trade secret, patent, or right of publicity.</li>
        <li>Constitutes defamation, fraud, or deceptive trade practices.</li>
        <li>Distributes malware, viruses, or any code designed to disrupt or damage systems.</li>
        <li>Generates regulated professional advice (medical, legal, financial, tax) in a way that you present as a substitute for a qualified human professional. The AI Paralegal, AI Bookkeeper, and similar AI Employees are productivity tools, not licensed professionals.</li>
        <li>Attempts to identify, deanonymize, or surveil any natural person without lawful basis.</li>
        <li>Targets minors under the age of 13 (or 16 where required by local law).</li>
      </ul>
      <p>
        We reserve the right to suspend or terminate accounts that violate
        this Acceptable Use Policy, with or without prior notice.
      </p>

      <h2>4. Your Content</h2>
      <p>
        <strong>"User Content"</strong> means any data, text, files, images,
        audio, prompts, or other material you upload, transmit, or generate
        through the Software, including messages, voice notes, attachments,
        bank statements, transcripts, tasks, and project documents.
      </p>
      <ul>
        <li>You retain all ownership rights in your User Content.</li>
        <li>You grant TeamNest a worldwide, royalty-free, non-exclusive license to host, store, transmit, display, reformat, and process your User Content solely as necessary to provide, secure, and improve the Software for you and your workspace.</li>
        <li>You represent and warrant that you have all rights, licenses, and consents necessary to upload your User Content and grant the license above.</li>
        <li>TeamNest does not use your User Content to train foundation models. AI prompts may be transmitted to sub-processors (OpenAI, Anthropic, Google, Deepgram, etc.) under zero-data-retention enterprise agreements where available.</li>
      </ul>

      <h2>5. AI Output</h2>
      <p>
        <strong>"AI Output"</strong> means responses, summaries, transcripts,
        suggestions, code, images, draft documents, and any other content
        produced by the AI features of the Software in response to your
        prompts.
      </p>
      <ul>
        <li>As between you and TeamNest, you own the AI Output generated from your prompts, to the extent permitted by applicable law and the terms of the underlying model provider.</li>
        <li>You are solely responsible for reviewing, verifying, and deciding how to use AI Output. AI Output may be inaccurate, incomplete, biased, or out of date. Do not rely on it as a substitute for professional judgement.</li>
        <li>Similar or identical AI Output may be generated for other users. You acknowledge that you do not have exclusive rights to any output that does not contain your own User Content.</li>
        <li>You will not present AI Output as if it were created by a natural person where law (e.g., disclosure rules for legal filings, academic submissions, or political advertising) requires disclosure.</li>
      </ul>

      <h2>6. Accounts, Subscriptions, and Fees</h2>
      <ul>
        <li>You must provide accurate registration information and keep it current. You are responsible for safeguarding your password and for any activity under your account.</li>
        <li>Paid plans, AI Employee subscriptions, and add-on credits are billed in advance through Stripe. Recurring charges automatically renew until cancelled.</li>
        <li>Except where required by law, fees are non-refundable. You may cancel future renewals at any time from the Billing screen.</li>
        <li>We may change prices with at least 30 days’ notice for active subscribers. Continued use after the change takes effect constitutes acceptance.</li>
        <li>Free tiers may be subject to credit caps, fair-use limits, and feature gating that can change at our discretion.</li>
      </ul>

      <h2>7. Third-Party Services</h2>
      <p>
        The Software integrates with third-party services including OpenAI,
        Anthropic, Google (Gemini), Perplexity, DeepSeek, xAI (Grok),
        Deepgram, LiveKit, Stripe, Twilio, QuickBooks Online, and others. Your
        use of those services is governed by their respective terms. TeamNest
        is not responsible for the availability, accuracy, or behaviour of
        third-party services.
      </p>

      <h2>8. Updates</h2>
      <p>
        We may release updates, patches, and new features at any time. Updates
        may modify, add, or remove functionality. The Software may
        automatically download and install updates. Continued use after an
        update constitutes acceptance.
      </p>

      <h2>9. Privacy</h2>
      <p>
        Our collection and use of personal data is governed by our{" "}
        <a href="/privacy">Privacy Policy</a>, which is incorporated into
        this EULA by reference.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SOFTWARE AND AI OUTPUT ARE
        PROVIDED <strong>"AS IS"</strong> AND <strong>"AS AVAILABLE"</strong>,
        WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR
        STATUTORY, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE,
        NON-INFRINGEMENT, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING
        OR USAGE OF TRADE. TEAMNEST DOES NOT WARRANT THAT THE SOFTWARE WILL BE
        UNINTERRUPTED, ERROR-FREE, SECURE, OR THAT AI OUTPUT WILL BE ACCURATE
        OR RELIABLE.
      </p>

      <h2>11. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL TEAMNEST OR
        ITS AFFILIATES, OFFICERS, EMPLOYEES, OR LICENSORS BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
        DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, GOODWILL, DATA, OR
        BUSINESS, ARISING OUT OF OR RELATED TO THIS EULA OR THE SOFTWARE,
        EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. TEAMNEST&apos;S
        TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THIS EULA WILL
        NOT EXCEED THE GREATER OF (A) USD $100 OR (B) THE AMOUNTS YOU PAID TO
        TEAMNEST IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO
        THE CLAIM.
      </p>

      <h2>12. Indemnification</h2>
      <p>
        You will defend, indemnify, and hold harmless TeamNest and its
        affiliates from and against any third-party claims, damages,
        liabilities, costs, and expenses (including reasonable attorneys&apos;
        fees) arising out of or related to: (a) your User Content; (b) your
        use of the Software in violation of this EULA, applicable law, or
        third-party rights; or (c) your use of AI Output.
      </p>

      <h2>13. Termination</h2>
      <ul>
        <li>You may terminate this EULA at any time by deleting your account.</li>
        <li>We may suspend or terminate your access for any breach of this EULA, suspected fraud, or in response to a lawful request.</li>
        <li>On termination, all licenses granted to you end immediately. Sections that by their nature should survive (IP, disclaimers, limitations of liability, indemnity, governing law) will survive.</li>
      </ul>

      <h2>14. Export Controls and Sanctions</h2>
      <p>
        The Software is subject to United States export control laws and the
        export and sanctions laws of other jurisdictions. You represent that
        you are not located in, under the control of, or a national or
        resident of any country subject to comprehensive U.S. sanctions and
        that you are not listed on any U.S. Government denied-party or
        sanctioned-party list.
      </p>

      <h2>15. Governing Law and Dispute Resolution</h2>
      <p>
        This EULA is governed by the laws of the State of Delaware, USA,
        without regard to conflict-of-law principles. Any dispute arising
        from or relating to this EULA will be resolved by binding arbitration
        administered by JAMS under its Comprehensive Arbitration Rules and
        Procedures, seated in Wilmington, Delaware. You and TeamNest each
        waive any right to a jury trial and to participate in a class action.
        Notwithstanding the foregoing, either party may seek injunctive
        relief in court for actual or threatened infringement of intellectual
        property rights.
      </p>

      <h2>16. Changes to this EULA</h2>
      <p>
        We may modify this EULA from time to time. If we make material
        changes, we will notify you via email or in-app banner at least 14
        days before they take effect. Continued use of the Software after the
        effective date constitutes acceptance of the revised EULA.
      </p>

      <h2>17. Entire Agreement</h2>
      <p>
        This EULA, together with our <a href="/privacy">Privacy Policy</a>{" "}
        and <a href="/terms">Terms of Service</a>, constitutes the entire
        agreement between you and TeamNest regarding the Software and
        supersedes any prior or contemporaneous agreements on the same
        subject. If any provision is held unenforceable, the remaining
        provisions will continue in full force.
      </p>

      <h2>18. Contact</h2>
      <p>
        Questions about this EULA? Email{" "}
        <a href="mailto:legal@teamnest.ai">legal@teamnest.ai</a>. For postal
        mail: TeamNest, 1111B S Governors Ave Ste 6433, Dover DE 19904,
        USA.
      </p>
    </LegalLayout>
  );
}
