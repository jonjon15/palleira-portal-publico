"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A cápsula de purificação em 3D — decoração, não uma ficha de Pal.
 *
 * Modelo real do jogo (`SM_PalBedFuturistic`, o mesh por trás do
 * `MedicalPalBed_05`), extraído via CUE4Parse.CLI em 13/09/2026. Ao
 * contrário dos Pals (`Pal3D`), este `.glb` não usa
 * `EXT_meshopt_compression` — dispensa o `MeshoptDecoder`.
 *
 * Sem `OrbitControls`: ninguém precisa girar a cápsula na mão, ela só gira
 * sozinha devagar, como um objeto de vitrine.
 *
 * O Pal dentro do tubo é fixo (Suzaku) só neste protótipo — em produção
 * isso vem da escolha do jogador (qual Pal da palbox entrou no ritual),
 * ainda sem lógica nenhuma por trás.
 */

const MODELO_URL = "/models/camara-purificacao/medicalpalbed_05.glb";
const MODELO_PAL_URL = "/models/pals/suzaku_water_42582c.glb";

type Estado = "carregando" | "pronto" | "erro";

export function Camara3D({ className = "h-72" }: { className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>("carregando");

  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;

    let cancelado = false;
    let limpar = () => {};

    (async () => {
      try {
        const [THREE, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/libs/meshopt_decoder.module.js"),
        ]);
        if (cancelado) return;

        const cena = new THREE.Scene();

        // Se o layout ainda não tem altura real no primeiro frame (fontes
        // carregando, hidratação), clientHeight pode vir 0 — um aspect
        // quebrado (Infinity/NaN) faz o enquadramento por FOV horizontal
        // sair completamente errado. 4/3 é só o chute inicial; o resize
        // observer corrige assim que o layout assentar.
        const aspectInicial =
          alvo.clientWidth > 0 && alvo.clientHeight > 0
            ? alvo.clientWidth / alvo.clientHeight
            : 4 / 3;

        const camera = new THREE.PerspectiveCamera(32, aspectInicial, 0.1, 1000);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(alvo.clientWidth, alvo.clientHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 2.2;
        alvo.appendChild(renderer.domElement);

        // Mesmo problema documentado no Pal3D: material metálico escuro
        // (a cápsula é cinza-chumbo) some contra o fundo escuro do site sem
        // luz ambiente forte cobrindo toda superfície, não importa o ângulo.
        cena.add(new THREE.AmbientLight(0xfff2d6, 4.5));
        cena.add(new THREE.HemisphereLight(0xfff6e6, 0xe4dcc9, 3.6));

        const chave = new THREE.DirectionalLight(0xf7dc7a, 3.6);
        chave.position.set(-2, 4, 3);
        cena.add(chave);
        const preenchimento = new THREE.DirectionalLight(0xffffff, 2.2);
        preenchimento.position.set(3, 2, 2);
        cena.add(preenchimento);
        const contraluz = new THREE.DirectionalLight(0xe8b923, 1.6);
        contraluz.position.set(2, 1, -3);
        cena.add(contraluz);

        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const [gltf, gltfPal] = await Promise.all([
          loader.loadAsync(MODELO_URL),
          loader.loadAsync(MODELO_PAL_URL).catch(() => null),
        ]);
        if (cancelado) return;

        const capsula = gltf.scene;

        // O vidro (M_PalProp_Glass_Inst) precisa ficar transparente para o
        // Pal aparecer por dentro — mas alpha por si só não basta: sem
        // desligar depthWrite e sem renderOrder explícito, o motor descarta
        // a peça errada dependendo do ângulo de câmera e o vidro "some". A
        // ordem correta é: vidro sempre depois de tudo, sem escrever no
        // depth buffer (não bloqueia o que está atrás dele).
        capsula.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (mat?.name === "M_PalProp_Glass_Inst") {
            mat.transparent = true;
            mat.opacity = 0.35;
            mat.depthWrite = false;
            mesh.renderOrder = 2;
          }
        });

        // Mesmo enquadramento automático do Pal3D: a cápsula é um objeto
        // só, mas o princípio de encaixar pela bounding box evita número
        // mágico de escala/distância chumbado no código.
        const limites = new THREE.Box3().setFromObject(capsula);
        const tamanho = limites.getSize(new THREE.Vector3());
        const centro = limites.getCenter(new THREE.Vector3());
        const maior = Math.max(tamanho.x, tamanho.y, tamanho.z) || 1;

        const escala = 1 / maior;
        capsula.scale.setScalar(escala);
        capsula.position.set(
          -centro.x * escala,
          -limites.min.y * escala,
          -centro.z * escala,
        );

        const suporte = new THREE.Group();
        suporte.add(capsula);

        // Enquadra pela altura real e pelo raio no plano XZ (não pela maior
        // dimensão X ou Z isolada) — o objeto gira em Y, então a "largura
        // visível" em ângulos intermediários é a diagonal projetada, maior
        // que qualquer aresta sozinha. Usar o raio circunscrito garante que
        // nenhuma ponta estoure a lateral do quadro em nenhum ângulo de
        // rotação. Recalculada toda vez que o aspect muda (inclusive no
        // primeiro resize de verdade).
        const alturaNormalizada = tamanho.y * escala;
        const raioXZ =
          Math.sqrt(tamanho.x * tamanho.x + tamanho.z * tamanho.z) * escala;
        const larguraNormalizada = raioXZ; // diâmetro do círculo que cobre qualquer rotação
        const MARGEM = 0.85;

        // O Pal flutua dentro do tubo, na metade da altura da cápsula —
        // proporção visual, não uma medida real do jogo (o tubo de vidro
        // não tem coordenadas próprias no glb, só o corpo da câmara).
        if (gltfPal) {
          const pal = gltfPal.scene;
          const limitesPal = new THREE.Box3().setFromObject(pal);
          const tamanhoPal = limitesPal.getSize(new THREE.Vector3());
          const centroPal = limitesPal.getCenter(new THREE.Vector3());
          const maiorPal = Math.max(tamanhoPal.x, tamanhoPal.y, tamanhoPal.z) || 1;

          // Ocupa ~55% da altura interna do tubo — sobra de espaço acima
          // e abaixo, como um corpo flutuando no líquido, não preenchendo
          // a cápsula de ponta a ponta.
          const escalaPal = (alturaNormalizada * 0.55) / maiorPal;
          pal.scale.setScalar(escalaPal);
          pal.position.set(
            -centroPal.x * escalaPal,
            alturaNormalizada * 0.42 - limitesPal.min.y * escalaPal,
            -centroPal.z * escalaPal,
          );
          pal.traverse((obj) => {
            (obj as THREE.Mesh).renderOrder = 1;
          });
          suporte.add(pal);
        }

        cena.add(suporte);

        const enquadrar = () => {
          const fovVertical = (camera.fov * Math.PI) / 180;
          const fovHorizontal =
            2 * Math.atan(Math.tan(fovVertical / 2) * camera.aspect);

          const distanciaPelaAltura =
            (alturaNormalizada * MARGEM) / 2 / Math.tan(fovVertical / 2);
          const distanciaPelaLargura =
            (larguraNormalizada * MARGEM) / 2 / Math.tan(fovHorizontal / 2);
          const distancia = Math.max(distanciaPelaAltura, distanciaPelaLargura);

          camera.position.set(0, alturaNormalizada / 2, distancia);
          camera.lookAt(0, alturaNormalizada / 2, 0);
        };
        enquadrar();

        const paradinho = matchMedia("(prefers-reduced-motion: reduce)");
        let quadro = 0;
        const desenhar = () => {
          quadro = requestAnimationFrame(desenhar);
          if (!paradinho.matches) suporte.rotation.y += 0.0012;
          renderer.render(cena, camera);
        };
        desenhar();

        const aoRedimensionar = () => {
          if (!alvo.clientWidth || !alvo.clientHeight) return;
          camera.aspect = alvo.clientWidth / alvo.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(alvo.clientWidth, alvo.clientHeight);
          enquadrar();
        };
        const observador = new ResizeObserver(aoRedimensionar);
        observador.observe(alvo);

        setEstado("pronto");

        limpar = () => {
          cancelAnimationFrame(quadro);
          observador.disconnect();
          cena.traverse((obj) => {
            const m = obj as {
              geometry?: { dispose(): void };
              material?: unknown;
            };
            m.geometry?.dispose();
            const materiais = Array.isArray(m.material)
              ? m.material
              : [m.material];
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
  }, []);

  return (
    <div className={`camara-glow relative w-full ${className}`}>
      <div ref={caixa} className="absolute inset-0" />

      {estado === "carregando" && (
        <div className="skeleton absolute inset-0" aria-hidden />
      )}

      {estado === "erro" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-muted">
            Não consegui carregar a cápsula aqui.
          </p>
        </div>
      )}

      {estado === "pronto" && (
        <div className="camara-bolhas" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      )}

      <span className="sr-only">
        A câmara de purificação — MedicalPalBed_05
      </span>
    </div>
  );
}
