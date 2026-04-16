import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CourtCheck — Supreme Court Filing Validator',
  description: 'AI-powered defect detection for Supreme Court of India filings. Validate SLPs, Civil Appeals, and Writ Petitions against SC Rules 2013.',
  keywords: 'Supreme Court India, SLP validator, legal filing, court rules, defect check',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col relative">
        {children}
      </body>
    </html>
  )
}
