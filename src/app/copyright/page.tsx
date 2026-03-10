export const metadata = {
  title: "Copyright - Level Up By Yourself",
};

export default function CopyrightPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200 px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">Copyright Notice</h1>
      <p className="text-sm text-gray-400 mb-8">Last updated: March 10, 2026</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">Copyright</h2>
          <p>
            &copy; 2026 Level Up by Yourself. All rights reserved.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">Ownership</h2>
          <p>
            All content, game mechanics, source code, visual assets, procedurally generated
            sprites, and AI-generated narratives within Level Up by Yourself are the
            intellectual property of Level Up by Yourself and its creator(s).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">Permitted Use</h2>
          <p>
            You may use the App for personal, non-commercial gameplay purposes. You may not
            reproduce, distribute, modify, or create derivative works from the App&apos;s content
            without prior written permission.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">Open Source Components</h2>
          <p>
            This App uses open-source libraries and frameworks. Each component retains its
            original license. Key dependencies include:
          </p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>Next.js - MIT License</li>
            <li>React - MIT License</li>
            <li>Solana Web3.js - Apache 2.0 License</li>
            <li>Expo - MIT License</li>
            <li>React Native - MIT License</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">Trademarks</h2>
          <p>
            &quot;Level Up by Yourself&quot; is a trademark of its creator(s). Solana, Phantom,
            Solflare, and other referenced brands are trademarks of their respective owners.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-white mb-2">Contact</h2>
          <p>
            For copyright inquiries, contact{" "}
            <a href="mailto:solanagamedev@gmail.com" className="text-blue-400 hover:underline">
              solanagamedev@gmail.com
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
