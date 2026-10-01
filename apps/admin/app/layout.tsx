import type { Metadata } from 'next'
import { Archivo, Nanum_Pen_Script } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
})

const nanumPenScript = Nanum_Pen_Script({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-nanum-pen-script',
})

export const metadata: Metadata = {
  title: 'swipeless admin',
  description: 'Operations console for swipeless',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${nanumPenScript.variable}`}
    >
      <body className="min-h-dvh bg-paper font-display text-text antialiased">
        {children}
      </body>
    </html>
  )
}
