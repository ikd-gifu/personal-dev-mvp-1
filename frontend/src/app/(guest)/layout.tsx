import { GuestLayoutWrapper } from "@/shared/components/layout/server/GuestLayoutWrapper";

export default async function GuestLayout(props: LayoutProps<"/">) {
  return <GuestLayoutWrapper>{props.children}</GuestLayoutWrapper>;
}
