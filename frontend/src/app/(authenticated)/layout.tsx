import { AuthenticatedLayoutWrapper } from "@/shared/components/layout/server/AuthenticatedLayoutWrapper";

export default async function AuthenticatedLayout(props: LayoutProps<"/">) {
  return (
    <AuthenticatedLayoutWrapper>{props.children}</AuthenticatedLayoutWrapper>
  );
}
