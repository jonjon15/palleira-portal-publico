import { momentoDoEvento, type Evento, type MomentoEvento } from "@/lib/eventos";

const ESTILO: Record<MomentoEvento, string> = {
  rolando: "border-success/30 bg-success/10 text-success",
  "em-breve": "border-warning/30 bg-warning/10 text-warning",
  encerrado: "border-line bg-surface-2 text-muted",
  aviso: "border-gold/30 bg-gold/10 text-gold",
};

const ROTULO: Record<MomentoEvento, string> = {
  rolando: "Rolando agora",
  "em-breve": "Em breve",
  encerrado: "Encerrado",
  aviso: "Aviso",
};

export function EventoSelo({
  evento,
}: {
  evento: Pick<Evento, "startsAt" | "endsAt">;
}) {
  const momento = momentoDoEvento(evento);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${ESTILO[momento]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {ROTULO[momento]}
    </span>
  );
}
