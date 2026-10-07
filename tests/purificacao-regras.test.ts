import { describe, expect, it } from "vitest";
import {
  acoesDoRitual,
  elegibilidadeAlvo,
  elegibilidadeDoador,
  ivMedioDoRitual,
  mesmaEspecie,
  ocupaACapsula,
  podeCancelar,
  podeDoar,
  podeResgatar,
  type PalParaValidar,
} from "@/lib/purificacao-regras";

const PASSIVAS = ["ElementBoost_Earth_1_PAL", "Deffence_up1", "ReloadSpeedUp_Passive", "TrainerMining_up1"];

const perfeito = (over: Partial<PalParaValidar> = {}): PalParaValidar => ({
  palId: "CatVampire",
  ivs: { Health: 100, AttackShot: 100, AttackMelee: 0, Defense: 100 },
  partnerSkillLevel: 5,
  passives: [...PASSIVAS],
  ...over,
});

/* ------------------------------------------------- botões x status do ritual */

describe("acoesDoRitual — o que aparece na tela em cada status", () => {
  const base = { ivMedio: 141, ivMinimoResgate: 110, resgatePendente: false };

  it("completo (IV 150) mostra o botão de resgatar — bug da Handoroki, 07/10/2026", () => {
    const a = acoesDoRitual({ ...base, status: "completo", ivMedio: 150 });
    expect(a.resgate).toBe("botao");
    expect(a.cancelar).toBe(false);
    expect(a.doar).toBe(false);
  });

  it("completo com resgate em andamento retoma o resgate", () => {
    expect(acoesDoRitual({ ...base, status: "completo", ivMedio: 150, resgatePendente: true }).resgate).toBe("pendente");
  });

  it("ativo acima do IV mínimo: doa, cancela e resgata", () => {
    expect(acoesDoRitual({ ...base, status: "ativo" })).toEqual({ resgate: "botao", cancelar: true, doar: true });
  });

  it("ativo abaixo do IV mínimo: mostra o aviso em vez do botão", () => {
    expect(acoesDoRitual({ ...base, status: "ativo", ivMedio: 105 }).resgate).toBe("iv_baixo");
  });

  it("aguardando regra: só cancela", () => {
    expect(acoesDoRitual({ ...base, status: "aguardando_regra" })).toEqual({ resgate: null, cancelar: true, doar: false });
  });

  it.each(["resgatado", "cancelado"])("%s: nenhuma ação", (status) => {
    expect(acoesDoRitual({ ...base, status })).toEqual({ resgate: null, cancelar: false, doar: false });
  });

  it("todo ritual que ocupa a cápsula tem pelo menos uma saída (resgatar ou cancelar)", () => {
    for (const status of ["aguardando_regra", "ativo", "completo"]) {
      expect(ocupaACapsula(status)).toBe(true);
      const a = acoesDoRitual({ ...base, status, ivMedio: 150 });
      expect(a.resgate !== null || a.cancelar).toBe(true);
    }
  });
});

describe("tela e servidor concordam", () => {
  // O botão só pode aparecer se a server action aceitar — e vice-versa.
  const status = ["aguardando_regra", "ativo", "completo", "resgatado", "cancelado"];
  it.each(status)("%s", (s) => {
    for (const ivMedio of [100, 109, 110, 141, 150]) {
      const a = acoesDoRitual({ status: s, ivMedio, ivMinimoResgate: 110, resgatePendente: false });
      expect(a.resgate === "botao").toBe(podeResgatar(s, ivMedio, 110));
      expect(a.cancelar).toBe(podeCancelar(s));
      expect(a.doar).toBe(podeDoar(s));
    }
  });
});

it("ritual completo bloqueia começar outro por cima", () => {
  expect(ocupaACapsula("completo")).toBe(true);
  expect(ocupaACapsula("resgatado")).toBe(false);
  expect(ocupaACapsula("cancelado")).toBe(false);
});

it("ivMedioDoRitual arredonda a média dos três eixos", () => {
  expect(ivMedioDoRitual({ ivHealth: 141, ivAttack: 141, ivDefense: 141 })).toBe(141);
  expect(ivMedioDoRitual({ ivHealth: 150, ivAttack: 150, ivDefense: 149 })).toBe(150);
});

/* ---------------------------------------------------------------- doador */

describe("elegibilidadeDoador", () => {
  it("Pal perfeito com todas as passivas pode doar", () => {
    expect(elegibilidadeDoador(perfeito(), PASSIVAS, "BOSS_CatVampire").ok).toBe(true);
  });

  it("alfa e comum contam como a mesma espécie (nos dois sentidos)", () => {
    expect(mesmaEspecie("BOSS_CatVampire", "CatVampire")).toBe(true);
    expect(elegibilidadeDoador(perfeito({ palId: "BOSS_CatVampire" }), PASSIVAS, "CatVampire").ok).toBe(true);
    expect(elegibilidadeDoador(perfeito(), PASSIVAS, "BOSS_CatVampire").ok).toBe(true);
  });

  it("espécie diferente não doa", () => {
    expect(elegibilidadeDoador(perfeito({ palId: "Anubis" }), PASSIVAS, "CatVampire").ok).toBe(false);
  });

  it("Ataque vale pelo maior eixo (Melee ou Shot)", () => {
    const melee = perfeito({ ivs: { Health: 100, AttackMelee: 100, AttackShot: 0, Defense: 100 } });
    expect(elegibilidadeDoador(melee, PASSIVAS, "CatVampire").ok).toBe(true);
  });

  it("IV abaixo de 100 em qualquer eixo não doa", () => {
    const fraco = perfeito({ ivs: { Health: 100, AttackShot: 99, Defense: 100 } });
    expect(elegibilidadeDoador(fraco, PASSIVAS, "CatVampire").ok).toBe(false);
  });

  it("sem condensar (menos de 4 estrelas) não doa", () => {
    expect(elegibilidadeDoador(perfeito({ partnerSkillLevel: 4 }), PASSIVAS, "CatVampire").ok).toBe(false);
  });

  it("precisa de TODAS as passivas, em qualquer ordem", () => {
    expect(elegibilidadeDoador(perfeito({ passives: [...PASSIVAS].reverse() }), PASSIVAS, "CatVampire").ok).toBe(true);
    expect(elegibilidadeDoador(perfeito({ passives: PASSIVAS.slice(0, 3) }), PASSIVAS, "CatVampire").ok).toBe(false);
  });

  it("ritual sem passivas definidas não aceita doação", () => {
    expect(elegibilidadeDoador(perfeito(), [], "CatVampire").ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ alvo */

describe("elegibilidadeAlvo", () => {
  it("Pal perfeito entra, alfa também", () => {
    expect(elegibilidadeAlvo(perfeito()).ok).toBe(true);
    expect(elegibilidadeAlvo(perfeito({ palId: "BOSS_CatVampire" })).ok).toBe(true);
  });

  it("Pal de Jornada (5 passivas) não entra", () => {
    expect(elegibilidadeAlvo(perfeito({ passives: [...PASSIVAS, "Legend"] })).ok).toBe(false);
  });

  it("IV abaixo de 100 ou sem condensar não entra", () => {
    expect(elegibilidadeAlvo(perfeito({ ivs: { Health: 99, AttackShot: 100, Defense: 100 } })).ok).toBe(false);
    expect(elegibilidadeAlvo(perfeito({ partnerSkillLevel: 1 })).ok).toBe(false);
  });

  it("Pal que já passou pela Câmara (IV 150) pode entrar de novo", () => {
    expect(elegibilidadeAlvo(perfeito({ ivs: { Health: 150, AttackShot: 150, Defense: 150 } })).ok).toBe(true);
  });
});
