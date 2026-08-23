"use client";

import { useEffect, useRef, useState } from "react";
import { urlDoModelo, nomeDoPal } from "@/lib/pals";

/**
 * O Pal em 3D, girando devagar.
 *
 * Existe para uma pergunta prática: **antes de gastar Paleta, o comprador
 * quer ver o bicho.** Ficha com número não mostra que o Anubis é enorme nem
 * que a skin muda a cor inteira.
 *
 * ⚠️ O `three` entra por import dinâmico dentro do efeito, e não no topo do
 * arquivo. São ~150 KB comprimidos: quem abre a vitrine não deve baixar isso,
 * só quem abre a ficha de um Pal.
 *
 * 📌 Os modelos vêm comprimidos com `EXT_meshopt_compression`, e o glTF manda
 * o carregador **recusar** um arquivo cuja extensão obrigatória ele não sabe
 * ler. Sem o decodificador, todo Pal falha — não é opcional.
 *
 * 📌 Não há animação nem esqueleto nesses modelos: o que dá vida é a câmera,
 * não o bicho. Por isso a rotação lenta, que também deixa ver o Pal por todos
 * os lados sem ninguém precisar arrastar nada.
 */

interface Props {
  palId: string;
  /** Altura da caixa. A largura acompanha o container. */
  className?: string;
}

type Estado = "carregando" | "pronto" | "sem-modelo" | "erro";

export function Pal3D({ palId, className = "h-72" }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    const url = urlDoModelo(palId);
    if (!url) {
      setEstado("sem-modelo");
      return;
    }

    const alvo = caixa.current;
    if (!alvo) return;

    // `cancelado` cobre o desmonte no meio do carregamento: sem isso, um
    // `setState` chega depois do componente sair e o `renderer` fica vivo
    // segurando contexto WebGL — poucos desses e o navegador derruba os
    // contextos antigos, apagando outros Pals na mesma página.
    let cancelado = false;
    let limpar = () => {};

    (async () => {
      try {
        const [THREE, { GLTFLoader }, { MeshoptDecoder }, { OrbitControls }] =
          await Promise.all([
            import("three"),
            import("three/examples/jsm/loaders/GLTFLoader.js"),
            import("three/examples/jsm/libs/meshopt_decoder.module.js"),
            import("three/examples/jsm/controls/OrbitControls.js"),
          ]);
        if (cancelado) return;

        const cena = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(
          35,
          alvo.clientWidth / alvo.clientHeight,
          0.1,
          1000,
        );

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true, // o fundo é o card do site, não uma cor nossa
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(alvo.clientWidth, alvo.clientHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        alvo.appendChild(renderer.domElement);

        // Luz de estúdio, não de jogo: uma chave quente vinda de cima à
        // esquerda (a mesma direção do brilho da palheta, §6.2), um
        // preenchimento frio do outro lado para o volume não morrer na
        // sombra, e um contraluz que separa o bicho do fundo escuro.
        cena.add(new THREE.HemisphereLight(0xfff1d0, 0x1a1712, 1.1));

        const chave = new THREE.DirectionalLight(0xffe8b0, 2.2);
        chave.position.set(-3, 4, 3);
        cena.add(chave);

        const preenchimento = new THREE.DirectionalLight(0x9fc0ff, 0.7);
        preenchimento.position.set(3, 1, 2);
        cena.add(preenchimento);

        const contraluz = new THREE.DirectionalLight(0xe8b923, 1.4);
        contraluz.position.set(0, 2, -4);
        cena.add(contraluz);

        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);

        const gltf = await loader.loadAsync(url);
        if (cancelado) return;

        const pal = gltf.scene;

        // Enquadramento pela caixa do próprio modelo: os Pals vão de um
        // Sheepball a um mamute, e altura fixa de câmera deixaria metade da
        // coleção minúscula e a outra metade cortada.
        const limites = new THREE.Box3().setFromObject(pal);
        const tamanho = limites.getSize(new THREE.Vector3());
        const centro = limites.getCenter(new THREE.Vector3());
        const maior = Math.max(tamanho.x, tamanho.y, tamanho.z) || 1;

        // Normaliza para uma unidade de altura e assenta no chão da cena,
        // para todo Pal ocupar a mesma moldura.
        const escala = 1 / maior;
        pal.scale.setScalar(escala);
        pal.position.set(
          -centro.x * escala,
          -limites.min.y * escala,
          -centro.z * escala,
        );

        const suporte = new THREE.Group();
        suporte.add(pal);
        cena.add(suporte);

        camera.position.set(0, 0.75, 2.6);
        const controles = new OrbitControls(camera, renderer.domElement);
        controles.target.set(0, 0.5, 0);
        controles.enablePan = false;
        controles.enableZoom = false; // a roda do mouse é da página, não daqui
        controles.enableDamping = true;
        controles.dampingFactor = 0.08;
        // Sem passar do horizonte: por baixo o modelo fica oco e feio.
        controles.minPolarAngle = Math.PI * 0.15;
        controles.maxPolarAngle = Math.PI * 0.52;
        controles.update();

        const paradinho = matchMedia("(prefers-reduced-motion: reduce)");
        let interagiu = false;
        // Quem pega o Pal na mão manda na câmera: a rotação automática para
        // e não volta a disputar o controle.
        controles.addEventListener("start", () => (interagiu = true));

        let quadro = 0;
        const desenhar = () => {
          quadro = requestAnimationFrame(desenhar);
          if (!interagiu && !paradinho.matches) suporte.rotation.y += 0.004;
          controles.update();
          renderer.render(cena, camera);
        };
        desenhar();

        const aoRedimensionar = () => {
          if (!alvo.clientWidth || !alvo.clientHeight) return;
          camera.aspect = alvo.clientWidth / alvo.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(alvo.clientWidth, alvo.clientHeight);
        };
        const observador = new ResizeObserver(aoRedimensionar);
        observador.observe(alvo);

        setEstado("pronto");

        limpar = () => {
          cancelAnimationFrame(quadro);
          observador.disconnect();
          controles.dispose();
          // Malha e textura não somem sozinhas quando a cena é descartada —
          // a memória de GPU vaza em silêncio até a aba engasgar.
          cena.traverse((obj) => {
            const m = obj as { geometry?: { dispose(): void }; material?: unknown };
            m.geometry?.dispose();
            const materiais = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of materiais) {
              if (!mat || typeof mat !== "object") continue;
              for (const valor of Object.values(mat)) {
                if (valor && typeof valor === "object" && "isTexture" in valor) {
                  (valor as unknown as { dispose(): void }).dispose();
                }
              }
              (mat as { dispose?(): void }).dispose?.();
            }
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!cancelado) setEstado("erro");
      }
    })();

    return () => {
      cancelado = true;
      limpar();
    };
  }, [palId]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-2 ${className}`}
    >
      <div ref={caixa} className="absolute inset-0" />

      {estado === "carregando" && (
        <div className="skeleton absolute inset-0" aria-hidden />
      )}

      {(estado === "sem-modelo" || estado === "erro") && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-muted">
            {estado === "sem-modelo"
              ? `Ainda não temos o modelo de ${nomeDoPal(palId)}.`
              : "Não consegui carregar o modelo 3D aqui."}
          </p>
        </div>
      )}

      {estado === "pronto" && (
        <p className="pointer-events-none absolute right-3 bottom-2 text-[0.7rem] text-muted opacity-70">
          arraste para girar
        </p>
      )}

      <span className="sr-only">Modelo 3D de {nomeDoPal(palId)}</span>
    </div>
  );
}
