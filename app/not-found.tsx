import Link from "next/link";
import { Pick } from "@/components/pick";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-28 text-center">
      <Pick className="size-10" />
      <p className="mt-6 text-xs font-bold tracking-[0.18em] text-gold uppercase">
        Erro 404
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        Essa página não existe
      </h1>
      <p className="mt-3 text-muted">
        Ou o link está errado, ou a gente ainda não construiu. Volta pro palco
        principal.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi"
      >
        Voltar para a home
      </Link>
    </div>
  );
}
