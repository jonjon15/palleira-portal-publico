import { SoMembros } from "@/components/so-membros";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SoMembros>{children}</SoMembros>;
}
