import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }
  if (session.error === "RefreshAccessTokenError") {
    // Refresh failed — bounce them through sign-in again to re-consent.
    redirect("/?reauth=1");
  }
  return <>{children}</>;
}
