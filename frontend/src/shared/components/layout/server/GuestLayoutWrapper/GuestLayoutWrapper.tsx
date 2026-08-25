import { redirectIfAuthenticatedServer } from "@/features/auth/servers/redirect.server";

export async function GuestLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfAuthenticatedServer();

  return <>{children}</>;
}
