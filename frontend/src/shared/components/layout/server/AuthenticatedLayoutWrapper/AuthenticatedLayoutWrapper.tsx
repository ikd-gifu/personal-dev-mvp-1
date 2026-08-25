import { getAuthenticatedSessionServer } from "@/features/auth/servers/redirect.server";

export async function AuthenticatedLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  await getAuthenticatedSessionServer();

  return <>{children}</>;
}
