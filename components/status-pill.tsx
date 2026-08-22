/** StatusPill — online / offline / instável (§6.3) */

type Status = "online" | "offline" | "instavel";

const STYLES: Record<Status, string> = {
  online: "border-success/30 bg-success/10 text-success",
  offline: "border-danger/30 bg-danger/10 text-danger",
  instavel: "border-warning/30 bg-warning/10 text-warning",
};

const LABELS: Record<Status, string> = {
  online: "Online",
  offline: "Offline",
  instavel: "Instável",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {LABELS[status]}
    </span>
  );
}

export type { Status };
