import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import "./erp.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ZapNFe | WhatsApp para NF-e",
  description: "Transforme pedidos recebidos pelo WhatsApp em pedidos faturados sem redigitação.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="pt-BR" className={inter.variable}><body>{children}</body></html>;
}
