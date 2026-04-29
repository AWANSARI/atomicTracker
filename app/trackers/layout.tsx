import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function TrackersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (session.error === "RefreshAccessTokenError") redirect("/?reauth=1");
  return <>{children}</>;
}
