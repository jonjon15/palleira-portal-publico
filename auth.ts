import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { buscarMembro, colocarNoServidor, logarNoDiscord } from "@/lib/discord";

/**
 * Login com Discord — a única porta de entrada do portal (§4.1 do PROMPT.md).
 *
 * Não existe cadastro por e-mail nem senha. A conta do Discord é a identidade
 * mestre: é ela que vai carregar a carteira de Paletas, os anúncios e o
 * vínculo com o personagem do jogo.
 *
 * Escopos pedidos, e só eles:
 *   identify            — quem é o usuário
 *   guilds              — de quais servidores participa (para checar a Palleira)
 *   guilds.members.read — os cargos dele dentro da Palleira
 *   guilds.join         — pôr no Discord da Palleira quem ainda não está
 *                         (pedido do dono em 24/09/2026; só esse servidor)
 *
 * Nada de ler mensagem.
 */

const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";

export interface GuildMembership {
  isMember: boolean;
  roles: string[];
  nick: string | null;
}

/** O Discord não respondeu — diferente de "respondeu que não é membro". */
class DiscordIndisponivel extends Error {}

/**
 * Busca cargos do usuário dentro da Palleira, usando o token dele.
 *
 * 🔴 **Só o 404 significa "não é membro".** Qualquer outra falha (429 do rate
 * limit, 5xx, timeout) tem de estourar, nunca virar `isMember: false` — ver o
 * tratamento em `jwt`.
 *
 * O motivo: `levelOf` devolve `visitante` quando `isMember` é falso, e
 * **descarta todos os cargos**. Um erro de rede de um segundo rebaixava o dono
 * do servidor a visitante, e a página de moderação sumia com 404 — sem erro na
 * tela, sem nada no log. Aconteceu com o dono em 18/09/2026, inclusive pelo
 * celular, o que descartou cache e JWT velho.
 *
 * O Discord limita a **5 requisições por segundo** por rota, e o site consulta
 * a cada 5 min por sessão: com várias pessoas navegando junto, o 429 é questão
 * de tempo.
 */
async function fetchMembership(accessToken: string): Promise<GuildMembership> {
  if (!GUILD_ID) return { isMember: false, roles: [], nick: null };

  const res = await fetch(
    `https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  // A única resposta que significa mesmo "essa pessoa não está no Discord".
  if (res.status === 404) return { isMember: false, roles: [], nick: null };

  if (!res.ok) {
    throw new DiscordIndisponivel(`Discord respondeu ${res.status}`);
  }

  const data = (await res.json()) as { roles?: string[]; nick?: string | null };
  return {
    isMember: true,
    roles: data.roles ?? [],
    nick: data.nick ?? null,
  };
}

/**
 * De quanto em quanto tempo os cargos do token são relidos do Discord.
 *
 * Cinco minutos é o meio-termo: quem acabou de comprar um plano não fica
 * esperando o dia seguinte para ver o daily maior, e o Discord não leva uma
 * chamada por navegação de página.
 */
const VALIDADE_DOS_CARGOS = 5 * 60 * 1000;

const precisaRenovar = (em: unknown) =>
  typeof em !== "number" || Date.now() - em > VALIDADE_DOS_CARGOS;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      authorization:
        "https://discord.com/api/oauth2/authorize?scope=identify+guilds+guilds.members.read+guilds.join",
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, account, profile }) {
      // Na hora do login: guarda o ID do Discord e consulta a associação.
      if (account?.access_token) {
        token.discordId = (profile?.id as string) ?? token.sub ?? "";
        try {
          let membership = await fetchMembership(account.access_token);

          // Ainda não está no Discord: põe agora, com o token do login.
          if (!membership.isMember && token.discordId) {
            const r = await colocarNoServidor(token.discordId as string, account.access_token);
            if (r.ok) {
              membership = { isMember: true, roles: r.membro?.roles ?? [], nick: null };
              await logarNoDiscord(`👋 <@${token.discordId}> entrou no Discord pelo login do site`).catch(() => {});
            } else {
              console.error("[login] não entrou no Discord:", r.erro);
            }
          }

          token.isMember = membership.isMember;
          token.roles = membership.roles;
          token.nick = membership.nick;
          token.rolesEm = Date.now();
        } catch {
          // Discord fora do ar na hora do login: entra como visitante, mas
          // **sem** carimbar `rolesEm`. Assim `precisaRenovar` devolve true
          // na primeira navegação e os cargos chegam em segundos, em vez de
          // a pessoa ficar 5 minutos rebaixada.
          token.isMember = false;
          token.roles = [];
          token.nick = null;
        }
        return token;
      }

      // Depois, de tempos em tempos: relê os cargos pelo bot.
      //
      // 🔴 Sem isto o JWT congela os cargos do login (30 dias, o padrão do
      // NextAuth). Quem comprou VIP depois de entrar no site continuava
      // recebendo 2 Paletas de daily e 1 slot de cofre — medido em
      // 12/09/2026: xneganxx e bolotaa, ambos com o plano Palleira, tinham
      // pego daily de 2 em vez de 12. Vale para permissão de staff também:
      // cargo tirado no Discord só valia no site no próximo login.
      if (token.discordId && precisaRenovar(token.rolesEm)) {
        try {
          const membro = await buscarMembro(token.discordId as string);
          token.isMember = Boolean(membro);
          token.roles = membro?.roles ?? [];
          token.nick = membro?.displayName ?? null;
          token.rolesEm = Date.now();
        } catch {
          // Discord fora do ar não pode deslogar ninguém: segue com o que
          // já estava no token e tenta de novo no próximo passe.
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.discordId = (token.discordId as string) ?? "";
      session.user.isMember = Boolean(token.isMember);
      session.user.roles = (token.roles as string[]) ?? [];
      session.user.nick = (token.nick as string | null) ?? null;
      return session;
    },
  },

  pages: { signIn: "/entrar" },
});
