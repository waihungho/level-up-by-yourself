export const metadata = {
  title: "Terms of Service - Level Up By Yourself",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200 px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">Terms of Service</h1>
      <p className="text-sm text-gray-400 mb-8">Last updated: March 10, 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Level Up by Yourself (&quot;the App&quot;), you agree to be bound by
            these Terms of Service. If you do not agree to these terms, do not use the App.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
          <p>
            Level Up by Yourself is an idle RPG game where users summon, train, and battle
            AI-powered agents on the Solana blockchain. The App uses Solana wallets for
            optional in-game transactions.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">3. Wallet and Transactions</h2>
          <p>
            You are solely responsible for the security of your Solana wallet and private keys.
            All SOL transactions are final and non-refundable. The App does not custody or
            control your funds at any time.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">4. User Conduct</h2>
          <p>You agree not to:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>Use the App for any unlawful purpose</li>
            <li>Attempt to exploit, hack, or reverse-engineer the App</li>
            <li>Interfere with other users&apos; enjoyment of the App</li>
            <li>Use automated tools or bots to interact with the App</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">5. Intellectual Property</h2>
          <p>
            All content, designs, and code in the App are the property of Level Up by Yourself.
            AI-generated agent narratives and procedurally generated sprites are created for
            your personal use within the App.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">6. Disclaimer of Warranties</h2>
          <p>
            The App is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
            uninterrupted access, accuracy of AI-generated content, or the value of any
            in-game assets.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, we shall not be liable for any indirect,
            incidental, or consequential damages arising from your use of the App, including
            but not limited to loss of SOL or other digital assets.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">8. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the App
            after changes constitutes acceptance of the updated terms.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">9. Contact</h2>
          <p>
            For questions about these terms, contact us at{" "}
            <a href="mailto:solanagamedev@gmail.com" className="text-blue-400 hover:underline">
              solanagamedev@gmail.com
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
