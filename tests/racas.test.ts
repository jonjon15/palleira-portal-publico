import { describe, expect, it } from "vitest";
import { chaveDeNome, lerRegistro } from "@/lib/racas";

// Posts reais do fórum de registro, copiados em 23/10/2026.
describe("lerRegistro", () => {
  it("lê o formato novo: nome do personagem e raça", () => {
    const reg = lerRegistro("NOME DO PERSONAGEM: Tony Maneiro\nRAÇA: KRYOS");
    expect(reg?.raca?.nome).toBe("Kryos");
    expect(reg?.personagem).toBe("Tony Maneiro");
    expect(reg?.secundario).toBeNull();
  });

  it("ignora o post de caracterização do dono e o título da thread", () => {
    expect(
      lerRegistro("# **CARACTERIZAÇÃO OBRIGATÓRIA **:\n\n## **KRYOS:** \n***Pele: Azul ***"),
    ).toBeNull();
    expect(lerRegistro("REGISTRE A SUA RAÇA E NOME DE PERSONAGEM")).toBeNull();
  });

  it("continua lendo o formato antigo, sem nome", () => {
    const reg = lerRegistro("RAÇA: Elfin\nELEMENTOS INICIAIS: Grama e Água");
    expect(reg?.raca?.nome).toBe("Elfien");
    expect(reg?.secundario).toBe("water");
    expect(reg?.personagem).toBeNull();
  });
});

describe("chaveDeNome", () => {
  it("casa nome espaçado do jogo com o nome do registro", () => {
    expect(chaveDeNome("C H R I S")).toBe(chaveDeNome("Chris"));
    expect(chaveDeNome("Tony Maneiro")).toBe(chaveDeNome("tonymaneiro"));
  });
});
