import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZapNFe | WhatsApp para NF-e",
  description: "Transforme pedidos recebidos pelo WhatsApp em pedidos faturados sem redigitação.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="pt-BR"><body>{children}</body></html>;
}
