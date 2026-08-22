"use client";

/**
 * Erro global — última barreira quando nem o layout renderiza.
 *
 * Precisa trazer <html> e <body> próprios, porque substitui o layout raiz.
 * Estado de erro é momento de marca (§6.2): pode ter personalidade, desde que
 * diga em português claro o que aconteceu e o que fazer.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          background: "#0b0a09",
          color: "#f2efe9",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          margin: 0,
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              color: "#e8b923",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Palleira
          </p>
          <h1 style={{ fontSize: "1.75rem", margin: "0.75rem 0" }}>
            A corda arrebentou
          </h1>
          <p style={{ color: "#a39b8c", lineHeight: 1.6, margin: 0 }}>
            Deu ruim de um jeito que a gente não previu. Tenta de novo — se
            insistir, avisa a staff no Discord.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#e8b923",
              color: "#14120f",
              border: 0,
              borderRadius: 8,
              padding: "0.6rem 1.25rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
