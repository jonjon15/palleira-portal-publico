import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

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
 *
 * Nada de ler mensagem, nada de entrar em servidor.
 */

const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";

export interface GuildMembership {
  isMember: boolean;
  roles: string[];
  nick: string | null;
}

/** Busca cargos do usuário dentro da Palleira, usando o token dele. */
async function fetchMembership(accessToken: string): Promise<GuildMembership> {
  if (!GUILD_ID) return { isMember: false, roles: [], nick: null };

  const res = await fetch(
    `https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  // 404 = não é membro. Qualquer outro erro também não deve derrubar o login:
  // a pessoa entra como visitante e vê a tela de convite.
  if (!res.ok) return { isMember: false, roles: [], nick: null };

  const data = (await res.json()) as { roles?: string[]; nick?: string | null };
  return {
    isMember: true,
    roles: data.roles ?? [],
    nick: data.nick ?? null,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      authorization:
        "https://discord.com/api/oauth2/authorize?scope=identify+guilds+guilds.members.read",
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, account, profile }) {
      // Só na hora do login: guarda o ID do Discord e consulta a associação.
      if (account?.access_token) {
        token.discordId = (profile?.id as string) ?? token.sub ?? "";
        const membership = await fetchMembership(account.access_token);
        token.isMember = membership.isMember;
        token.roles = membership.roles;
        token.nick = membership.nick;
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
