import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZK Vote on Celestia',
  description: 'Anonymous voting powered by ZKPassport and Celestia DA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 font-mono">
        <header className="border-b border-gray-800 px-6 py-4">
          <nav className="max-w-5xl mx-auto flex items-center gap-6">
            <a href="/" className="text-lg font-bold text-purple-400 hover:text-purple-300">
              ZK Vote
            </a>
            <span className="text-gray-600 text-sm">on Celestia mocha-4</span>
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
