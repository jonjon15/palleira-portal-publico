import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Privacidade",
  description:
    "O que a Palleira guarda sobre você, por quê, e como pedir para apagar.",
};

/**
 * A página de privacidade da §10 do PROMPT.md.
 *
 * Estava no rodapé de todo o site desde o começo, mas nunca existiu: dava
 * 404 em qualquer clique (achado em 12/09/2026). É requisito de LGPD e,
 * antes disso, é o que explica para a comunidade por que o site pede login
 * do Discord e o que faz com isso.
 *
 * 🔴 **Cada linha daqui foi conferida no `db/schema.sql`, não escrita de
 * memória.** Se uma tabela nova guardar algo sobre a pessoa, esta página
 * precisa mudar junto — uma política que não bate com o banco é pior do que
 * nenhuma.
 */

interface Bloco {
  titulo: string;
  itens: { rotulo: string; detalhe: string }[];
}

const GUARDAMOS: Bloco[] = [
  {
    titulo: "Do seu Discord",
    itens: [
      {
        rotulo: "O ID da sua conta",
        detalhe:
          "O número que o Discord usa para te identificar. É a sua identidade aqui dentro — é nele que a carteira de Paletas e o cofre ficam pendurados.",
      },
      {
        rotulo: "Seu apelido no servidor",
        detalhe:
          "Só para a administração conseguir te reconhecer numa lista, em vez de ver um número. Não é guardado no banco: é perguntado ao Discord na hora de montar a tela.",
      },
      {
        rotulo: "Seus cargos na Palleira",
        detalhe:
          "Para saber se você é membro, se é VIP e se pode abrir as telas de administração. Ficam no seu login, não numa tabela nossa.",
      },
    ],
  },
  {
    titulo: "Do seu personagem no jogo",
    itens: [
      {
        rotulo: "O identificador do personagem",
        detalhe:
          "O código que o Palworld dá à sua conta de jogo. É o que liga o que você faz no servidor ao que aparece no site.",
      },
      {
        rotulo: "Nome, nível e número de Pals",
        detalhe:
          "Lidos do próprio servidor para montar o ranking e o seu painel. Mudam quando você joga.",
      },
      {
        rotulo: "Sua guilda e suas bases",
        detalhe:
          "Para o mapa, o ranking de guildas e a restauração de base. Posição de base do servidor PvP nunca vai para o mapa público.",
      },
      {
        rotulo: "O que você guarda no cofre",
        detalhe:
          "Item e Pal que você mesmo tirou do jogo, mais o registro de cada entrada e saída — é o que permite a administração conferir se algo se perdeu no caminho.",
      },
    ],
  },
  {
    titulo: "Do que você faz aqui",
    itens: [
      {
        rotulo: "Sua carteira de Paletas",
        detalhe:
          "Cada lançamento fica registrado com data e motivo: daily, venda, compra, ajuste da administração. O extrato é seu e você vê inteiro na carteira.",
      },
      {
        rotulo: "Seus anúncios no mercado",
        detalhe: "O que você colocou à venda, por quanto, e para quem vendeu.",
      },
      {
        rotulo: "Ações de administração",
        detalhe:
          "Kick, ban e mexida em Paletas ficam num registro que não pode ser apagado, com o nome de quem fez. Vale para a administração inteira, inclusive o dono.",
      },
    ],
  },
];

const NAO_GUARDAMOS = [
  {
    rotulo: "Seu endereço de IP",
    detalhe:
      "A API do servidor de jogo devolve o IP de todo mundo que está online. Ele é descartado na primeira função que o recebe e nunca chega ao banco, ao navegador, nem a um log nosso.",
  },
  {
    rotulo: "Sua senha",
    detalhe:
      "Não existe senha aqui. Você entra pelo Discord, e o site nunca vê a sua.",
  },
  {
    rotulo: "Seu e-mail",
    detalhe:
      "O login nem pede permissão para ler e-mail — só quem você é, de quais servidores participa e quais cargos tem na Palleira.",
  },
  {
    rotulo: "Suas conversas",
    detalhe:
      "O site não lê mensagem do Discord nem chat do jogo. A única coisa que ele manda para dentro do jogo é o código de 6 dígitos do vínculo, direto para o seu personagem.",
  },
];

export default function Privacidade() {
  return (
    <>
      <PageHeader
        kicker="Transparência"
        title="Privacidade"
        description="O que a Palleira guarda sobre você, por quê, e como pedir para apagar."
      />

      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-lg text-muted">
          O site existe para ligar a sua conta do Discord ao seu personagem no
          jogo. Tudo que ele guarda serve a isso — nada é vendido, nada é
          passado para fora, e não existe anúncio nem rastreador aqui dentro.
        </p>

        {/* ------------------------------------------------- o que guardamos */}
        <h2 className="mt-12 text-xl font-bold tracking-tight">
          O que fica guardado
        </h2>

        {GUARDAMOS.map((bloco) => (
          <section key={bloco.titulo} className="mt-6">
            <h3 className="text-sm font-bold tracking-[0.14em] text-gold uppercase">
              {bloco.titulo}
            </h3>
            <ul className="mt-3 space-y-3">
              {bloco.itens.map((i) => (
                <li
                  key={i.rotulo}
                  className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                >
                  <p className="font-semibold">{i.rotulo}</p>
                  <p className="mt-1 text-sm text-muted">{i.detalhe}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* --------------------------------------------- o que NÃO guardamos */}
        <h2 className="mt-12 text-xl font-bold tracking-tight">
          O que o site <span className="text-gold">não</span> guarda
        </h2>
        <ul className="mt-4 space-y-3">
          {NAO_GUARDAMOS.map((i) => (
            <li
              key={i.rotulo}
              className="rounded-[var(--radius-card)] border border-success/30 bg-success/[0.05] p-4"
            >
              <p className="font-semibold">{i.rotulo}</p>
              <p className="mt-1 text-sm text-muted">{i.detalhe}</p>
            </li>
          ))}
        </ul>

        {/* ------------------------------------------------------ quem vê o quê */}
        <h2 className="mt-12 text-xl font-bold tracking-tight">Quem vê o quê</h2>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            <b className="text-text">Qualquer pessoa</b> vê o que já é público
            no jogo: nome de personagem, nível, guilda e posição no ranking.
            São as mesmas informações que aparecem para quem está online no
            servidor.
          </p>
          <p className="text-sm text-muted">
            <b className="text-text">Só você</b> vê a sua carteira, o seu
            extrato de Paletas e o seu cofre.
          </p>
          <p className="text-sm text-muted">
            <b className="text-text">A administração</b> vê saldos e o registro
            de movimentação, porque é o que permite corrigir erro e resolver
            disputa. Toda mexida em Paleta feita por um administrador fica
            registrada com o nome dele e aparece no seu extrato.
          </p>
        </div>

        {/* ----------------------------------------------------- fora daqui */}
        <h2 className="mt-12 text-xl font-bold tracking-tight">
          Para onde os dados vão
        </h2>
        <p className="mt-4 text-sm text-muted">
          Para lugar nenhum além do necessário para o site funcionar: o
          Discord (que faz o login), os servidores de jogo da Palleira, e a
          hospedagem e o banco de dados onde o site roda. Nada é vendido nem
          compartilhado para publicidade.
        </p>

        {/* -------------------------------------------------------- apagar */}
        <h2 className="mt-12 text-xl font-bold tracking-tight">
          Apagar os seus dados
        </h2>
        <div className="mt-4 space-y-3 text-sm text-muted">
          <p>
            Você pode desfazer o vínculo entre a sua conta do Discord e o seu
            personagem a qualquer momento, sozinho, em{" "}
            <Link href="/vincular" className="text-gold hover:underline">
              Vincular personagem
            </Link>
            .
          </p>
          <p>
            Para apagar o resto — carteira, cofre e histórico —, é só pedir
            pelo Discord da Palleira. Duas coisas continuam depois disso, e é
            justo você saber antes: o registro de ações da administração, que
            não pode ser apagado porque é o que garante que ninguém mexe em
            Paleta escondido; e os dados que vêm do próprio jogo (nome, nível,
            guilda), que voltam a aparecer sozinhos enquanto você jogar nos
            servidores, porque são lidos de lá e não de um cadastro nosso.
          </p>
          <p>
            Se quiser tirar item ou Pal do cofre antes, faça isso primeiro:
            apagada a conta, não há como devolver o que estava guardado.
          </p>
        </div>

        {/* -------------------------------------------------------- rodapé */}
        <div className="mt-12 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <p className="text-sm text-muted">
            Dúvida sobre qualquer coisa desta página? Chame a administração no
            Discord da Palleira. Se algo aqui mudar, a mudança aparece nesta
            mesma página.
          </p>
        </div>
      </div>
    </>
  );
}
