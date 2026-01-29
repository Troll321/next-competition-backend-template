import { redirect, RedirectType } from "next/navigation";

export default function Layout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    if (process.env.NODE_ENV === "production") {
        redirect("/", RedirectType.replace);
    }
    return <>{children}</>;
}
