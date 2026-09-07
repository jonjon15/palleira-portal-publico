"use client";

import { useActionState, useRef, useState } from "react";
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
  dispararResetDias,
  dispararWipe,
  consultarSituacao,
  dispararRestauracao,
  dispararRestauracaoBag,
  dispararSondagemBags,
  dispararReversao,
  cancelarPedidoDeFila,
  estornarPedidoDeFila,
  type Estado,
  type EstadoBusca,
  type Achado,
  type EstadoSituacao,
  type Situacao,
} from "./actions";
import type { PedidoAdmin } from "@/lib/resgate-base";

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
          Nome de quem vai ser{" "}
          <b className="text-danger">apagado do mundo</b> — vem do último
          import, que roda de 2 em 2 horas
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
        /*
          A lista de achados é o momento do clique errado: aqui e na
          restauração ela tem o mesmo formato. Por isso esta é vermelha e o
          botão diz "apagar" — não basta a seção lá em cima estar marcada.
        */
        <ul className="divide-y divide-danger/15 overflow-hidden rounded-[var(--radius-card)] border border-danger/30 bg-danger/[0.03]">
          {busca.achados.map((a) => {
            const escolhido = alvo?.uid === a.uid;
            return (
              <li
                key={a.uid}
                className={`flex items-center gap-3 px-4 py-3 text-sm ${
                  escolhido ? "bg-danger/[0.1]" : ""
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
                  className={botaoPerigo}
                >
                  {escolhido ? "Cancelar" : "Escolher para apagar"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* --------------------------------------------------------- apagar */}
      {alvo && (
        <form
          action={resetAcao}
          /*
            Segunda tranca, independente da primeira. Digitar o nome no
            formulário prova que a pessoa sabe QUEM está apagando; o popup
            prova que ela sabe O QUE está fazendo, e tira do automático quem
            já clicou em "Apagar" antes.
          */
          onSubmit={(e) => {
            const r = window.prompt(
              `Isto apaga ${alvo.nome} (nível ${alvo.level}) do mundo e não tem volta.

` +
                `O servidor vai parar por cerca de 1 minuto.

` +
                `Digite CONFIRMAR para prosseguir:`,
            );
            if (r?.trim().toUpperCase() !== "CONFIRMAR") {
              e.preventDefault();
            }
          }}
          className="space-y-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger/[0.05] p-5"
        >
          <input type="hidden" name="servidor" value={servidor} />
          <input type="hidden" name="uid" value={alvo.uid} />
          <input type="hidden" name="nome" value={alvo.nome} />
          <input type="hidden" name="modo" value="aplicar" />

          <p className="text-sm text-muted">
            <b className="text-danger">Isto não tem volta.</b>{" "}
            <b className="text-text">{alvo.nome}</b> (nível {alvo.level}) perde
            personagem, itens e Pals, e volta do zero.
          </p>

          <ul className="space-y-1 text-xs text-muted">
            <li>✓ O servidor é parado de verdade antes de gravar — e a gravação
              é recusada se ele ainda estiver de pé</li>
            <li>✓ O mundo é salvo pelo desligamento, e a data do arquivo é
              conferida</li>
            <li>✓ O backup é enviado <b className="text-text">e conferido byte
              a byte</b> antes de qualquer sobrescrita</li>
            <li>✓ O servidor volta sozinho, mesmo se algo falhar no meio</li>
          </ul>

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

/* --------------------------------------------------------- zerar dias */

/**
 * Zera o "Dias" do mundo — o campo GameDateTimeTicks do Level.sav.
 *
 * Duas travas antes de gravar: escolher "Zerar de verdade" (sai do modo
 * verificar/simular) e digitar ZERAR — mesmo espírito do reset de jogador,
 * mas sem nome de pessoa para conferir aqui.
 */
export function ZerarDias({
  servidor,
  diasAtual,
}: {
  servidor: string;
  diasAtual: number | null;
}) {
  const [estado, acao, rodando] = useActionState(dispararResetDias, SEM_ESTADO);
  const [dias, setDias] = useState("0");
  const [confirmando, setConfirmando] = useState(false);
  const [digitado, setDigitado] = useState("");

  const confere = digitado.trim().toUpperCase() === "ZERAR";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="dias" className="block text-sm text-muted">
          Para quantos dias zerar
        </label>
        <input
          id="dias"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          inputMode="numeric"
          className={`${campo} mt-1.5 max-w-[10rem]`}
        />
      </div>

      {!confirmando ? (
        <div className="flex flex-wrap items-center gap-3">
          <form action={acao}>
            <input type="hidden" name="servidor" value={servidor} />
            <input type="hidden" name="modo" value="verificar" />
            <button type="submit" disabled={rodando} className={botaoFantasma}>
              {rodando ? "Rodando…" : "Testar integridade"}
            </button>
          </form>
          <form action={acao}>
            <input type="hidden" name="servidor" value={servidor} />
            <input type="hidden" name="modo" value="simular" />
            <input type="hidden" name="dias" value={dias} />
            <button type="submit" disabled={rodando} className={botaoFantasma}>
              {rodando ? "Rodando…" : "Simular"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className={botaoPerigo}
          >
            Zerar de verdade
          </button>
        </div>
      ) : (
        <form
          action={acao}
          onSubmit={(e) => {
            const r = window.prompt(
              `Isto reescreve o Level.sav de ${servidor} e para o servidor por cerca de 1 minuto.

Digite CONFIRMAR para prosseguir:`,
            );
            if (r?.trim().toUpperCase() !== "CONFIRMAR") {
              e.preventDefault();
            }
          }}
          className="space-y-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger/[0.05] p-5"
        >
          <input type="hidden" name="servidor" value={servidor} />
          <input type="hidden" name="modo" value="aplicar" />
          <input type="hidden" name="dias" value={dias} />

          <p className="text-sm text-muted">
            {diasAtual !== null && (
              <>
                Dias atual: <b className="text-text">{diasAtual}</b>.{" "}
              </>
            )}
            Vai virar <b className="text-text">{dias}</b>. Personagens,
            cofres e bases não são tocados — só esse contador.
          </p>

          <ul className="space-y-1 text-xs text-muted">
            <li>✓ O servidor é parado de verdade antes de gravar</li>
            <li>
              ✓ O backup é enviado <b className="text-text">e conferido byte
              a byte</b> antes de qualquer sobrescrita
            </li>
            <li>✓ O servidor volta sozinho, mesmo se algo falhar no meio</li>
          </ul>

          <div>
            <label htmlFor="confirmacaoDias" className="block text-sm text-muted">
              Para confirmar, digite <b className="text-text">ZERAR</b>
            </label>
            <input
              id="confirmacaoDias"
              name="confirmacao"
              autoComplete="off"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              className={`${campo} mt-1.5`}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={rodando || !confere}
              className={botaoPerigo}
            >
              {rodando ? "Disparando…" : `Zerar dias de ${servidor}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className={botaoFantasma}
            >
              Cancelar
            </button>
          </div>
          <Aviso {...estado} />
        </form>
      )}

      {!confirmando && <Aviso {...estado} />}
    </div>
  );
}

/* -------------------------------------------------------------------- wipe */

/**
 * Wipe de verdade: apaga o mundo inteiro do servidor escolhido.
 *
 * Sem campo de texto na tela — o servidor já vem fixado pelas abas do topo
 * da página, então não há o que selecionar errado aqui. A trava inteira
 * mora no popup: ele pede para digitar o nome do servidor, e a resposta
 * alimenta o campo oculto `confirmacao` que a Server Action confere.
 */
export function WipeMundo({
  servidor,
  nomeServidor,
}: {
  servidor: string;
  nomeServidor: string;
}) {
  const [estado, acao, rodando] = useActionState(dispararWipe, SEM_ESTADO);
  const confirmacaoRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={acao}>
          <input type="hidden" name="servidor" value={servidor} />
          <input type="hidden" name="modo" value="simular" />
          <button type="submit" disabled={rodando} className={botaoFantasma}>
            {rodando ? "Rodando…" : "Conferir mundo atual"}
          </button>
        </form>

        <form
          action={acao}
          onSubmit={(e) => {
            const r = window.prompt(
              `⚠️ ATENÇÃO — isto apaga o MUNDO INTEIRO de ${nomeServidor}, para sempre, pelo site.

Todo jogador perde personagem, base, itens e Pals. Sem exceção. Isto não é zerar uma pessoa: é o servidor inteiro.

Um mundo novo e vazio nasce quando o servidor subir de novo.

Para confirmar, digite o nome do servidor: ${nomeServidor}`,
            );
            if (!r || r.trim().toLowerCase() !== nomeServidor.toLowerCase()) {
              e.preventDefault();
              return;
            }
            if (confirmacaoRef.current) confirmacaoRef.current.value = r.trim();
          }}
        >
          <input type="hidden" name="servidor" value={servidor} />
          <input type="hidden" name="modo" value="aplicar" />
          <input type="hidden" name="confirmacao" ref={confirmacaoRef} />
          <button type="submit" disabled={rodando} className={botaoPerigo}>
            {rodando ? "Disparando…" : "Apagar o mundo inteiro"}
          </button>
        </form>
      </div>

      <p className="text-xs text-muted">
        O mundo atual não é apagado na hora — vira backup ao lado, no próprio
        servidor, mas não tem como restaurar pelo site.
      </p>

      <Aviso {...estado} />
    </div>
  );
}

/* --------------------------------------------- restaurar jogador */

const SEM_SITUACAO: EstadoSituacao = { ok: false, mensagem: "" };

/**
 * Devolve a um jogador o que o servidor apagou.
 *
 * Vem em dois escopos, e a diferença não é técnica, é de risco:
 *
 *   - `jogador` — save individual, Pals e bag. Só acrescenta ao dono, não tira
 *     nada de ninguém, e o resto da guild nem percebe.
 *   - `guild` — o mesmo mais a **base**, que é da guild inteira: mexe no
 *     território de todos os membros.
 *
 * Ficaram separados a pedido do dono: eram uma seção só com um checkbox
 * "sem base", e a coisa segura acabava escondida dentro da arriscada.
 *
 * Não pergunta nome de arquivo de backup nem UUID: o motor acha sozinho o
 * backup mais recente que ainda tem o que devolver.
 */
export function RestaurarJogador({
  servidor,
  escopo = "guild",
}: {
  servidor: string;
  escopo?: "jogador" | "guild";
}) {
  const [busca, buscarAcao, buscando] = useActionState(consultarSituacao, SEM_SITUACAO);
  const [envio, enviarAcao, enviando] = useActionState(dispararRestauracao, SEM_ESTADO);
  const [bags, bagsAcao, sondando] = useActionState(dispararSondagemBags, SEM_ESTADO);
  const [bag, bagAcao, devolvendo] = useActionState(dispararRestauracaoBag, SEM_ESTADO);
  const [alvo, setAlvo] = useState<Situacao | null>(null);
  const [digitado, setDigitado] = useState("");

  const semBase = escopo === "jogador";
  const id = escopo; // os dois formulários convivem na mesma página
  const confere = alvo && digitado.trim().toLowerCase() === alvo.nome.toLowerCase();

  return (
    <div className="space-y-5">
      <form action={buscarAcao} className="space-y-3">
        <input type="hidden" name="servidor" value={servidor} />
        <label htmlFor={`termo-${id}`} className="block text-sm text-muted">
          {semBase
            ? "Nome do jogador que perdeu os Pals ou os itens"
            : "Nome de um membro da guild que perdeu a base"}
        </label>
        <div className="flex gap-2">
          <input
            id={`termo-${id}`}
            name="termo"
            required
            minLength={2}
            placeholder="Tenshi"
            className={`${campo} flex-1`}
          />
          <button type="submit" disabled={buscando} className={botaoFantasma}>
            {buscando ? "Procurando…" : "Procurar"}
          </button>
        </div>
        {!busca.situacoes && <Aviso {...busca} />}
      </form>

      {busca.situacoes && busca.situacoes.length > 0 && (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line">
          {busca.situacoes.map((s) => {
            const escolhido = alvo?.uid === s.uid;
            return (
              <li
                key={s.uid}
                className={`flex items-center gap-3 px-4 py-3 text-sm ${
                  escolhido ? "bg-gold/[0.07]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.nome}</p>
                  <p className="truncate text-xs text-muted">
                    nível {s.level} · <b className="text-text">{s.pals}</b> Pals ·{" "}
                    {s.guild ? (
                      <>
                        {s.guild} com <b className="text-text">{s.bases}</b>{" "}
                        {s.bases === 1 ? "base" : "bases"}
                      </>
                    ) : (
                      "sem guild"
                    )}{" "}
                    · {s.atualizado}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAlvo(escolhido ? null : s);
                    setDigitado("");
                  }}
                  className={botaoFantasma}
                >
                  {escolhido ? "Cancelar" : "Escolher"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {alvo && (
        <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface-2/40 p-5">
          <p className="text-sm text-muted">
            {semBase ? (
              <>
                Devolve a <b className="text-text">{alvo.nome}</b> o save
                individual e os Pals com as caixas, do backup mais recente que
                ainda tiver o que voltar. <b className="text-text">Não mexe na
                base</b> e não tira nada de ninguém — nem dele, nem da guild.
              </>
            ) : (
              <>
                Devolve à guild de <b className="text-text">{alvo.nome}</b> a
                base, junto com o save individual e os Pals dele. A base é da{" "}
                <b className="text-text">guild inteira</b>: confira com os
                membros antes.
              </>
            )}
          </p>

          <ul className="space-y-1 text-xs text-muted">
            <li>✓ O servidor é parado uma vez só e volta sozinho no fim</li>
            <li>
              ✓ Um backup do mundo é gravado e conferido antes de qualquer
              sobrescrita
            </li>
            <li>
              ✓ A gravação é recusada se sobrar qualquer referência quebrada —
              foi o que derrubou o servidor em 05/09
            </li>
            <li>⏱ Leva uns 10 minutos; o servidor fica fora do ar nesse tempo</li>
          </ul>

          {/*
            Conferir a bag é só leitura — não para o servidor e não grava. Fica
            aqui porque a pergunta "os itens dele voltaram mesmo?" aparece
            junto com a restauração, e porque em 05/09 quem perdeu a bag foi a
            guild inteira, não só quem reclamou.
          */}
          {semBase && (
            <form action={bagsAcao} className="border-t border-line pt-4">
              <input type="hidden" name="servidor" value={servidor} />
              <input type="hidden" name="uid" value={alvo.uid} />
              <input type="hidden" name="guilda" value={alvo.guild ?? ""} />
              <button type="submit" disabled={sondando} className={botaoFantasma}>
                {sondando
                  ? "Pedindo…"
                  : alvo.guild
                    ? `Conferir as bags da guild ${alvo.guild}`
                    : "Conferir a bag deste jogador"}
              </button>
              <p className="mt-2 text-xs text-muted">
                Só lê o mundo: diz quem está com os containers de item zerados —
                o sintoma de bag desligada. Não derruba ninguém.
              </p>
              <Aviso {...bags} />
            </form>
          )}

          {/*
            Devolver a bag é um conserto à parte: religa itens que ficaram
            para trás nos backups sob GUIDs antigos. Fica junto porque a
            pergunta vem sempre depois de conferir — e porque o que o jogador
            juntou desde a perda é somado, não jogado fora.
          */}
          {semBase && (
            <div className="space-y-3 border-t border-line pt-4">
              <p className="text-sm text-muted">
                Se a conferência acusou containers zerados, dá para devolver os
                itens de <b className="text-text">{alvo.nome}</b> — mochila,
                essenciais, armas, armadura e comida. O que ele juntou desde a
                perda é somado, não jogado fora.
              </p>
              <form action={bagAcao}>
                <input type="hidden" name="servidor" value={servidor} />
                <input type="hidden" name="uid" value={alvo.uid} />
                <input type="hidden" name="nome" value={alvo.nome} />
                <input type="hidden" name="modo" value="simular" />
                <button type="submit" disabled={devolvendo} className={botaoFantasma}>
                  {devolvendo ? "Pedindo…" : "Ver a bag que voltaria (item por item)"}
                </button>
              </form>
            </div>
          )}

          {/*
            O campo de confirmação mora fora dos formulários porque destrava
            mais de um botão: devolver a bag e devolver os Pals são disparos
            diferentes e ambos pedem o nome digitado. Repetir o campo em cada
            um só faria digitar duas vezes a mesma coisa.
          */}
          <div className="border-t border-line pt-4">
            <label htmlFor={`conf-${id}`} className="block text-sm text-muted">
              Para disparar de verdade, digite{" "}
              <b className="text-text">{alvo.nome}</b>
            </label>
            <input
              id={`conf-${id}`}
              autoComplete="off"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              className={`${campo} mt-1.5`}
            />
          </div>

          {/* Simular primeiro é grátis e não derruba ninguém. */}
          <form action={enviarAcao} className="flex flex-wrap gap-2">
            <input type="hidden" name="servidor" value={servidor} />
            <input type="hidden" name="uid" value={alvo.uid} />
            <input type="hidden" name="nome" value={alvo.nome} />
            <input type="hidden" name="pular_base" value={semBase ? "1" : "0"} />
            <input type="hidden" name="modo" value="simular" />
            <button type="submit" disabled={enviando} className={botaoFantasma}>
              {enviando ? "Pedindo…" : "Ver o que voltaria (não altera nada)"}
            </button>
          </form>

          <form
            action={enviarAcao}
            onSubmit={(e) => {
              const r = window.prompt(
                semBase
                  ? `Isto para o servidor por cerca de 10 minutos para devolver os Pals e o save de ${alvo.nome}. A base não é tocada.\n\nDigite CONFIRMAR para prosseguir:`
                  : `Isto para o servidor por cerca de 10 minutos e devolve a BASE da guild de ${alvo.nome} — território de todos os membros.\n\nDigite CONFIRMAR para prosseguir:`,
              );
              if (r?.trim().toUpperCase() !== "CONFIRMAR") e.preventDefault();
            }}
            className="space-y-3"
          >
            <input type="hidden" name="servidor" value={servidor} />
            <input type="hidden" name="uid" value={alvo.uid} />
            <input type="hidden" name="nome" value={alvo.nome} />
            <input type="hidden" name="pular_base" value={semBase ? "1" : "0"} />
            <input type="hidden" name="modo" value="aplicar" />
            <input type="hidden" name="confirmacao" value={digitado} />

            <button type="submit" disabled={enviando || !confere} className={botao}>
              {enviando
                ? "Disparando…"
                : semBase
                  ? `Devolver os Pals de ${alvo.nome}`
                  : `Devolver a base da guild de ${alvo.nome}`}
            </button>
          </form>

          {semBase && (
            <form
              action={bagAcao}
              onSubmit={(e) => {
                const r = window.prompt(
                  `Isto para o servidor por alguns minutos para devolver os itens de ${alvo.nome}.\n\nDigite CONFIRMAR para prosseguir:`,
                );
                if (r?.trim().toUpperCase() !== "CONFIRMAR") e.preventDefault();
              }}
            >
              <input type="hidden" name="servidor" value={servidor} />
              <input type="hidden" name="uid" value={alvo.uid} />
              <input type="hidden" name="nome" value={alvo.nome} />
              <input type="hidden" name="modo" value="aplicar" />
              <input type="hidden" name="confirmacao" value={digitado} />
              <button
                type="submit"
                disabled={devolvendo || !confere}
                className={botaoFantasma}
              >
                {devolvendo ? "Disparando…" : `Devolver a bag de ${alvo.nome}`}
              </button>
            </form>
          )}

          <Aviso {...bag} />
          <Aviso {...envio} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------- reverter o save */

/**
 * Saída de emergência: volta o mundo ao último backup.
 *
 * Só faz sentido com o servidor já quebrado — desfaz TUDO desde aquele
 * backup, para todo mundo.
 */
export function ReverterSave({ servidor }: { servidor: string }) {
  const [estado, acao, enviando] = useActionState(dispararReversao, SEM_ESTADO);
  const [digitado, setDigitado] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Para quando o servidor <b className="text-text">não sobe mais</b> depois
        de uma gravação. Devolve o mundo ao backup mais recente e liga o
        servidor.
      </p>

      <form action={acao}>
        <input type="hidden" name="servidor" value={servidor} />
        <input type="hidden" name="modo" value="listar" />
        <button type="submit" disabled={enviando} className={botaoFantasma}>
          {enviando ? "Pedindo…" : "Ver os backups disponíveis"}
        </button>
      </form>

      <form
        action={acao}
        onSubmit={(e) => {
          const r = window.prompt(
            "Isto desfaz TUDO o que aconteceu no mundo desde o último backup — de todos os jogadores, não só de um.\n\nSó use com o servidor quebrado.\n\nDigite CONFIRMAR para prosseguir:",
          );
          if (r?.trim().toUpperCase() !== "CONFIRMAR") e.preventDefault();
        }}
        className="space-y-3 rounded-[var(--radius-card)] border border-danger/30 bg-danger/[0.05] p-5"
      >
        <input type="hidden" name="servidor" value={servidor} />
        <input type="hidden" name="modo" value="aplicar" />

        <p className="text-sm text-muted">
          <b className="text-danger">Desfaz o progresso de todo mundo</b> desde o
          último backup. O save problemático é guardado, não apagado.
        </p>

        <div>
          <label htmlFor="conf-reverter" className="block text-sm text-muted">
            Para voltar o mundo, digite <b className="text-text">REVERTER</b>
          </label>
          <input
            id="conf-reverter"
            name="confirmacao"
            autoComplete="off"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            className={`${campo} mt-1.5`}
          />
        </div>

        <button
          type="submit"
          disabled={enviando || digitado.trim().toUpperCase() !== "REVERTER"}
          className={botaoPerigo}
        >
          {enviando ? "Disparando…" : "Voltar o mundo ao último backup"}
        </button>
        <Aviso {...estado} />
      </form>
    </div>
  );
}

/* ------------------------------------------------ fila de restauração paga */

const STATUS_LABEL: Record<string, string> = {
  fila: "Na fila",
  rodando: "Rodando",
  feito: "Feito",
  recusado: "Recusado",
};

const STATUS_COR: Record<string, string> = {
  fila: "border-warning/30 bg-warning/10 text-warning",
  rodando: "border-gold/30 bg-gold/10 text-gold",
  feito: "border-success/30 bg-success/10 text-success",
  recusado: "border-danger/30 bg-danger/10 text-danger",
};

function LinhaFila({ pedido, nome }: { pedido: PedidoAdmin; nome: string }) {
  const [cancelar, cancelarAcao, cancelando] = useActionState(cancelarPedidoDeFila, SEM_ESTADO);
  const [estornar, estornarAcao, estornando] = useActionState(estornarPedidoDeFila, SEM_ESTADO);

  const precisaEstorno =
    pedido.status === "recusado" && pedido.paletas > 0 && !pedido.estornado;

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold tracking-wider uppercase ${
            STATUS_COR[pedido.status] ?? "border-line text-muted"
          }`}
        >
          {STATUS_LABEL[pedido.status] ?? pedido.status}
        </span>
        <span className="text-muted">{pedido.serverName}</span>
        <span className="font-semibold">{nome}</span>
        {pedido.guildName && (
          <span className="text-muted">
            {pedido.guildName}
            {pedido.pieceCount !== null && ` · ${pedido.pieceCount} peça(s)`}
          </span>
        )}
        {pedido.paletas > 0 && (
          <span className="tabular text-xs text-muted">
            {pedido.paletas} Paletas{pedido.estornado ? " (estornado)" : ""}
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted">
          {new Date(pedido.createdAt).toLocaleString("pt-BR")}
        </span>
      </div>
      {pedido.detail && <p className="mt-1 text-xs text-muted">{pedido.detail}</p>}

      {pedido.status === "fila" && (
        <form action={cancelarAcao} className="mt-2">
          <input type="hidden" name="id" value={pedido.id} />
          <input type="hidden" name="servidor" value={pedido.serverSlug} />
          <button type="submit" disabled={cancelando} className={botaoPerigo}>
            {cancelando ? "Cancelando…" : "Cancelar pedido"}
          </button>
        </form>
      )}

      {precisaEstorno && (
        <form action={estornarAcao} className="mt-2">
          <input type="hidden" name="id" value={pedido.id} />
          <input type="hidden" name="servidor" value={pedido.serverSlug} />
          <button type="submit" disabled={estornando} className={botao}>
            {estornando ? "Estornando…" : `Estornar ${pedido.paletas} Paletas`}
          </button>
        </form>
      )}

      <Aviso {...cancelar} />
      <Aviso {...estornar} />
    </li>
  );
}

/**
 * A fila de `base_restore_requests` — item 6 da fase 2 da restauração paga.
 *
 * Não é escopada pelo servidor selecionado no topo da página: um pedido já
 * carrega o servidor dele, e a lista inteira cabe numa tela só. Em andamento
 * (`rodando`, `fila`) vem primeiro; o histórico depois — é a ordem que
 * `filaAdmin()` já devolve.
 */
export function FilaDeRestauracao({
  pedidos,
  nomes,
}: {
  pedidos: PedidoAdmin[];
  nomes: Record<string, string>;
}) {
  if (pedidos.length === 0) {
    return <p className="text-sm text-muted">Nenhum pedido de restauração ainda.</p>;
  }
  return (
    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      {pedidos.map((p) => (
        <LinhaFila key={p.id} pedido={p} nome={nomes[p.discordId] ?? p.discordId} />
      ))}
    </ul>
  );
}
