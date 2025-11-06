import './globals.css'

export const metadata = {
  title: 'xVoice Offer Builder',
  description: 'Angebots- und Bestell-Konfigurator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
