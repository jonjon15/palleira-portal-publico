"use client";

import { useActionState, useState } from "react";
import {
  salvarMundo,
  enviarAnuncio,
  agirSobreJogador,
  banirManual,
  desbanirManual,
  desligarServidor,
  energiaServidor,
  buscarJogador,
  dispararReset,
  type Estado,
  type EstadoBusca,
  type Achado,
} from "./actions";

const SEM_ESTADO: Estado = { ok: false, mensagem: "" };

const botao =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] bg-gold px-5 py-2.5 font-semibold text-[#14120f] transition-colors hover:bg-gold-hi disabled:cursor-not-allowed disabled:opacity-50";

const botaoFantasma =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] border border-line-strong px-5 py-2.5 font-semibold transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

const botaoPerigo =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50";

const campo =
  "w-full rounded-[var(--radius-control)] border border-line bg-bg px-4 py-2.5 outline-none focus:border-gold";

function Aviso({ ok, mensagem }: Estado) {
  if (!mensagem) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm ${
        ok
          ? "border-success/30 bg-success/[0.08] text-success"
          : "border-danger/30 bg-danger/[0.08] text-danger"
      }`}
    >
      {mensagem}
    </p>
  );
}

/* -------------------------------------------------------------- ações rápidas */

export function SalvarMundo({ servidor }: { servidor: string }) {
  const [estado, acao, pendente] = useActionState(salvarMundo, SEM_ESTADO);
  return (
    <form action={acao}>
      <input type="hidden" name="servidor" value={servidor} />
      <button type="submit" disabled={pendente} className={botaoFantasma}>
        {pendente ? "Salvando…" : "Salvar mundo"}
      </button>
      <Aviso {...estado} />
    </form>
  );
}

export function Desligar({
  servidor,
  temPainel,
}: {
  servidor: string;
  temPainel: boolean;
}) {
  const [estado, acao, pendente] = useActionState(desligarServidor, SEM_ESTADO);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="servidor" value={servidor} />
      <div className="flex gap-3">
        <div className="w-28 shrink-0">
          <label htmlFor="espera" className="block text-sm text-muted">
            Segundos
          </label>
          <input
            id="espera"
            name="espera"
            type="number"
            min={0}
            max={3600}
            required
            defaultValue={60}
            className={`${campo} tabular mt-1.5`}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="mensagem-shutdown" className="block text-sm text-muted">
            Motivo, aparece no chat
          </label>
          <input
            id="mensagem-shutdown"
            name="mensagem"
            required
            placeholder="Manutenção rápida, volta já já"
            className={`${campo} mt-1.5`}
          />
        </div>
      </div>
      {/*
        A REST do Palworld é servida pelo próprio processo do servidor: quando
        ele cai, a API cai junto. Não existe `start` — e não teria como existir.
        Quem religa é o painel da ENX, então o aviso fica colado no botão.
      */}
      <p className="rounded-[var(--radius-card)] border border-danger/30 bg-danger/[0.07] px-4 py-3 text-sm text-muted">
        <b className="text-danger">Isto desliga, não reinicia.</b>{" "}
        {temPainel ? (
          <>
            Para trazer de volta, use <b className="text-text">Iniciar</b> em
            Energia, logo acima. Quem quer só reiniciar avisando os jogadores
            deve usar <b className="text-text">Reiniciar</b> — ele faz as duas
            pontas sozinho.
          </>
        ) : (
          <>
            O site ainda não consegue ligar de volta neste servidor: falta
            cadastrar o ID do painel. Para subir de novo, o botão{" "}
            <b className="text-text">Iniciar</b> no painel da ENX.
          </>
        )}
      </p>

      <button
        type="submit"
        disabled={pendente}
        className="inline-flex items-center justify-center rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-5 py-2.5 font-semibold text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendente ? "Desligando…" : "Desligar servidor"}
      </button>
      <Aviso {...estado} />
    </form>
  );
}

/* ----------------------------------------------------------------- anúncio */

export function Anuncio({ servidor }: { servidor: string }) {
  const [estado, acao, pendente] = useActionState(enviarAnuncio, SEM_ESTADO);
  return (
    <form action={acao}>
      <input type="hidden" name="servidor" value={servidor} />
      <label htmlFor="mensagem" className="block text-sm text-muted">
        Aparece no chat de todo mundo que estiver dentro do jogo agora
      </label>
      <textarea
        id="mensagem"
        name="mensagem"
        rows={2}
        maxLength={300}
        required
        placeholder="Servidor reinicia às 22h para manutenção — salvem o progresso"
        className={`${campo} mt-2`}
      />
      <div className="mt-3">
        <button type="submit" disabled={pendente} className={botao}>
          {pendente ? "Enviando…" : "Publicar anúncio"}
        </button>
      </div>
      <Aviso {...estado} />
    </form>
  );
}

/* --------------------------------------------------------- ban/unban manual */

export function BanManual({ servidor }: { servidor: string }) {
  const [estado, acao, pendente] = useActionState(banirManual, SEM_ESTADO);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="servidor" value={servidor} />
      <div>
        <label htmlFor="ban-userId" className="block text-sm text-muted">
          userId do jogador
        </label>
        <input
          id="ban-userId"
          name="userId"
          required
          placeholder="steam_76561198000866703"
          className={`${campo} mt-1.5 font-mono text-sm`}
        />
      </div>
      <div>
        <label htmlFor="ban-motivo" className="block text-sm text-muted">
          Motivo — fica no log de auditoria
        </label>
        <input
          id="ban-motivo"
          name="motivo"
          required
          placeholder="Griefing na base X, denúncia de fulano"
          className={`${campo} mt-1.5`}
        />
      </div>
      <button type="submit" disabled={pendente} className={botaoPerigo}>
        {pendente ? "Banindo…" : "Banir por userId"}
      </button>
      <Aviso {...estado} />
    </form>
  );
}

export function UnbanManual({ servidor }: { servidor: string }) {
  const [estado, acao, pendente] = useActionState(desbanirManual, SEM_ESTADO);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="servidor" value={servidor} />
      <div>
        <label htmlFor="unban-userId" className="block text-sm text-muted">
          userId do jogador
        </label>
        <input
          id="unban-userId"
          name="userId"
          required
          placeholder="steam_76561198000866703"
          className={`${campo} mt-1.5 font-mono text-sm`}
        />
      </div>
      <button type="submit" disabled={pendente} className={botaoFantasma}>
        {pendente ? "Desbanindo…" : "Desbanir por userId"}
      </button>
      <Aviso {...estado} />
    </form>
  );
}

/* --------------------------------------------------- linha de jogador online */

export function LinhaJogador({
  servidor,
  userId,
  nome,
}: {
  servidor: string;
  userId: string;
  nome: string;
}) {
  const [estado, acao, pendente] = useActionState(agirSobreJogador, SEM_ESTADO);
  return (
    <>
      <tr className="text-sm">
        <td className="px-4 py-3 font-medium">{nome}</td>
        <td className="px-4 py-3">
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
            {userId}
          </code>
        </td>
        <td className="px-4 py-3">
          <form action={acao} className="flex justify-end gap-2">
            <input type="hidden" name="servidor" value={servidor} />
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="nome" value={nome} />
            <button
              type="submit"
              name="acao"
              value="kick"
              disabled={pendente}
              className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning transition-colors hover:bg-warning/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Kick
            </button>
            <button
              type="submit"
              name="acao"
              value="ban"
              disabled={pendente}
              className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ban
            </button>
          </form>
        </td>
      </tr>
      {estado.mensagem && (
        <tr>
          <td colSpan={3} className="px-4 pb-3">
            <Aviso {...estado} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- energia */

/**
 * Iniciar / Reiniciar / Finalizar pelo painel da ENX.
 *
 * Não tem "Desligar" aqui de propósito: para desligar existe o formulário
 * com contagem regressiva, que avisa quem está jogando. Repetir o corte
 * seco do painel seria oferecer o jeito pior de fazer a mesma coisa.
 */
export function Energia({
  servidor,
  ligado,
}: {
  servidor: string;
  ligado: boolean;
}) {
  const [estado, acao, pendente] = useActionState(energiaServidor, SEM_ESTADO);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="servidor" value={servidor} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="sinal"
          value="start"
          disabled={pendente || ligado}
          title={ligado ? "O servidor já está no ar" : undefined}
          className={botaoFantasma}
        >
          Iniciar
        </button>
        <button
          type="submit"
          name="sinal"
          value="restart"
          disabled={pendente}
          className={botao}
        >
          {pendente ? "Enviando…" : "Reiniciar"}
        </button>
        <button
          type="submit"
          name="sinal"
          value="kill"
          disabled={pendente || !ligado}
          title="Corta o processo na hora, sem salvar. Só quando travar."
          className={botaoPerigo}
        >
          Finalizar
        </button>
      </div>
      <p className="text-xs text-muted">
        <b className="text-text">Reiniciar</b> salva o mundo sozinho antes de
        derrubar, e leva cerca de 40s para voltar. O que ele não faz é avisar
        quem está jogando — mande um anúncio antes.{" "}
        <b className="text-text">Finalizar</b> mata o processo{" "}
        <b className="text-danger">sem salvar</b>: último recurso, quando o
        servidor travou e não responde a mais nada.
      </p>
      <Aviso {...estado} />
    </form>
  );
}

/* ---------------------------------------------------------- reset de jogador */

const SEM_BUSCA: EstadoBusca = { ok: false, mensagem: "" };

/**
 * Apagar jogador do mundo — o site é só o botão.
 *
 * O trabalho roda no GitHub Actions: descomprimir 339 MB de mundo com Oodle
 * não cabe em função serverless. Ver `lib/github.ts` e §3.8 do PROMPT.md.
 */
export function ResetarJogador({ servidor }: { servidor: string }) {
  const [busca, buscarAcao, buscando] = useActionState(buscarJogador, SEM_BUSCA);
  const [reset, resetAcao, resetando] = useActionState(dispararReset, SEM_ESTADO);
  const [alvo, setAlvo] = useState<Achado | null>(null);
  const [digitado, setDigitado] = useState("");

  const confere =
    alvo && digitado.trim().toLowerCase() === alvo.nome.toLowerCase();

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- procurar */}
      <form action={buscarAcao} className="space-y-3">
        <input type="hidden" name="servidor" value={servidor} />
        <label htmlFor="termo" className="block text-sm text-muted">
          Nome do jogador — vem do último import, que roda de 2 em 2 horas
        </label>
        <div className="flex gap-2">
          <input
            id="termo"
            name="termo"
            required
            minLength={2}
            placeholder="Gadl"
            className={`${campo} flex-1`}
          />
          <button type="submit" disabled={buscando} className={botaoFantasma}>
            {buscando ? "Procurando…" : "Procurar"}
          </button>
        </div>
        {!busca.achados && <Aviso {...busca} />}
      </form>

      {/* -------------------------------------------------------- achados */}
      {busca.achados && busca.achados.length > 0 && (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line">
          {busca.achados.map((a) => {
            const escolhido = alvo?.uid === a.uid;
            return (
              <li
                key={a.uid}
                className={`flex items-center gap-3 px-4 py-3 text-sm ${
                  escolhido ? "bg-danger/[0.07]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.nome}</p>
                  <p className="truncate font-mono text-xs text-muted">{a.uid}</p>
                </div>
                <span className="tabular shrink-0 text-muted">lvl {a.level}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAlvo(escolhido ? null : a);
                    setDigitado("");
                  }}
                  className={escolhido ? botaoPerigo : botaoFantasma}
                >
                  {escolhido ? "Cancelar" : "Escolher"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* --------------------------------------------------------- apagar */}
      {alvo && (
        <form action={resetAcao} className="space-y-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger/[0.05] p-5">
          <input type="hidden" name="servidor" value={servidor} />
          <input type="hidden" name="uid" value={alvo.uid} />
          <input type="hidden" name="nome" value={alvo.nome} />
          <input type="hidden" name="modo" value="aplicar" />

          <p className="text-sm text-muted">
            <b className="text-danger">Isto não tem volta.</b>{" "}
            <b className="text-text">{alvo.nome}</b> (nível {alvo.level}) perde
            personagem, itens e Pals, e volta do zero. O servidor cai por cerca
            de 1 minuto e volta sozinho. Fica um backup no servidor.
          </p>

          <div>
            <label htmlFor="confirmacao" className="block text-sm text-muted">
              Para confirmar, digite <b className="text-text">{alvo.nome}</b>
            </label>
            <input
              id="confirmacao"
              name="confirmacao"
              autoComplete="off"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              className={`${campo} mt-1.5`}
            />
          </div>

          <button
            type="submit"
            disabled={resetando || !confere}
            className={botaoPerigo}
          >
            {resetando ? "Disparando…" : `Apagar ${alvo.nome} do mundo`}
          </button>
          <Aviso {...reset} />
        </form>
      )}

      {/* ------------------------------------------------ teste sem risco */}
      {!alvo && (
        <form action={resetAcao} className="border-t border-line pt-4">
          <input type="hidden" name="servidor" value={servidor} />
          <input type="hidden" name="modo" value="verificar" />
          <button type="submit" disabled={resetando} className={botaoFantasma}>
            {resetando ? "Rodando…" : "Testar integridade do mundo"}
          </button>
          <p className="mt-2 text-xs text-muted">
            Lê o mundo e confere que reescrever não corrompe nada. Não altera
            e não derruba o servidor — é seguro rodar a qualquer hora.
          </p>
          <Aviso {...reset} />
        </form>
      )}
    </div>
  );
}
