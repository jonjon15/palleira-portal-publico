import type { DefaultSession } from "next-auth";

/**
 * Campos que a Palleira acrescenta à sessão (§4.1).
 *
 * `discordId` é a chave primária de identidade — nunca o nome de usuário,
 * que a pessoa pode trocar quando quiser.
 */
declare module "next-auth" {
  interface Session {
    user: {
      discordId: string;
      /** Se é membro do servidor Palleira BR */
      isMember: boolean;
      /** IDs dos cargos dele no servidor */
      roles: string[];
      /** Apelido dentro do servidor, quando tem */
      nick: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordId?: string;
    isMember?: boolean;
    roles?: string[];
    nick?: string | null;
  }
}
