import type { Metadata } from "next";
import "./globals.css";

import { Toaster } from "@root/src/components/ui/Sonner";

export const metadata: Metadata = {
    title: "My Title",
    description: "My Description",
    icons: {
        icon: "/assets/favicon/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`antialiased`}>
                <main>
                    {children}
                </main>
                <Toaster />
            </body>
        </html>
    );
}
