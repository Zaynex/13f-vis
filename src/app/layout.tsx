import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '13F Tracker — Smart Money Visualizer',
  description:
    'Track institutional investors 13F filings. See what Berkshire, Bridgewater, Citadel and other top funds are buying and selling every quarter.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>" />
      </head>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
        {children}
      </body>
    </html>
  )
}
