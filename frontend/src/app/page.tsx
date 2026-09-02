import { redirect } from "next/navigation";
import { getSessionServer } from "@/features/auth/servers/session.server";

export default async function Home() {
  const session = await getSessionServer();

  if (session?.account) {
    redirect("/notes");
  }

  redirect("/login");
}
