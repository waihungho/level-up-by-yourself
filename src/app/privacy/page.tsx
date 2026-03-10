export const metadata = {
  title: "Privacy Policy - Level Up By Yourself",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200 px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-8">Last updated: March 10, 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">1. Information We Collect</h2>
          <p>We collect the following information when you use Level Up by Yourself:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Wallet Address:</strong> Your Solana public key used to identify your account</li>
            <li><strong>Game Data:</strong> Agent stats, battle history, growth records, and leaderboard rankings</li>
            <li><strong>Transaction Data:</strong> SOL payment transactions for in-game purchases</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">2. Information We Do Not Collect</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>Private keys or wallet seed phrases</li>
            <li>Personal identifying information (name, email, phone number)</li>
            <li>Location data</li>
            <li>Device identifiers or advertising IDs</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">3. How We Use Your Information</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>To provide and maintain the game experience</li>
            <li>To process in-game SOL transactions</li>
            <li>To generate AI-powered agent narratives</li>
            <li>To display leaderboard rankings</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">4. Data Storage</h2>
          <p>
            Game data is stored on Supabase (PostgreSQL) with row-level security policies.
            Transaction data is publicly available on the Solana blockchain.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">5. Third-Party Services</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li><strong>Solana Blockchain:</strong> For processing SOL transactions</li>
            <li><strong>Helius RPC:</strong> For Solana network communication</li>
            <li><strong>Supabase:</strong> For game data storage</li>
            <li><strong>Anthropic (Claude):</strong> For AI-generated agent narratives</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">6. Data Security</h2>
          <p>
            We implement reasonable security measures to protect your game data. However,
            no method of electronic storage is 100% secure. Your wallet security is your
            responsibility.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">7. Children&apos;s Privacy</h2>
          <p>
            The App is not intended for children under 13. We do not knowingly collect
            information from children under 13.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify users of
            significant changes through the App.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">9. Contact</h2>
          <p>
            For privacy-related questions, contact us at{" "}
            <a href="mailto:solanagamedev@gmail.com" className="text-blue-400 hover:underline">
              solanagamedev@gmail.com
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
