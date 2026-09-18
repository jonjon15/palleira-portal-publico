"""Religa a REST API do PalDefender num servidor que perdeu a configuração.

Uma reinstalação pelo painel da ENX preserva `Pal/Saved`, mas devolve
`Pal/Binaries/Win64/PalDefender/RESTAPI/` de fábrica: `RESTConfig.json`
volta com `"Enabled": false` na porta 17993 (que não é alocada) e a pasta
`Tokens/` fica vazia. Sem esses dois arquivos a porta recusa conexão
(ECONNREFUSED) e o site perde tudo que depende de jogador ao vivo — a lista
de personagens da página /vincular, o ranking e o cofre.

Foi o que aconteceu com o PVE Free depois da reinstalação de 16/09/2026
(ver a memória `crash-loop-pve-free-16092026`).

⚠️ O PalDefender lê os dois arquivos **no boot**. Escrever com o servidor no
ar não liga a REST: precisa de um restart, que é decisão do dono.

Uso:
    python tools/religar_rest_paldefender.py pve-free --simular
    python tools/religar_rest_paldefender.py pve-free --aplicar
"""

import argparse
import json
import sys

import paramiko

# Host/porta/usuário batem com `lib/servers.ts` e com o secret PALLEIRA_SERVERS.
SERVIDORES = {
    "pve-free": {
        "host": "enx-soc-20.enx.host",
        "user": "qv6mfi1u.0c079595",
        "porta_rest": 10052,
        "env": "SRV1_PALDEFENDER_TOKEN",
    },
    "pve-vip": {
        "host": "enx-cirion-30.enx.host",
        "user": "qv6mfi1u.6eb8d521",
        "porta_rest": 10064,
        "env": "SRV2_PALDEFENDER_TOKEN",
    },
    "pvp-free": {
        "host": "enx-cirion-16.enx.host",
        "user": "qv6mfi1u.59ec87fa",
        "porta_rest": 10077,
        "env": "SRV3_PALDEFENDER_TOKEN",
    },
}

BASE = "Pal/Binaries/Win64/PalDefender/RESTAPI"

# As mesmas permissões que os outros dois servidores já usam. `Items.Give` e
# `Pals.Give` são o que entrega compra do Mercado e resgate do cofre.
PERMISSOES = [
    "REST.Players.Read",
    "REST.Pals.Read",
    "REST.Items.Read",
    "REST.Items.Give",
    "REST.Pals.Give",
    "REST.Guilds.Read",
]


def ler_senha_sftp() -> str:
    """A senha do SFTP vem do ambiente, nunca do código.

    Este repositório é público: qualquer coisa escrita aqui fica legível
    para todo mundo, e no histórico do Git para sempre.
    """
    senha = os.environ.get("PALLEIRA_SFTP_PASSWORD", "")
    if not senha:
        raise SystemExit(
            "PALLEIRA_SFTP_PASSWORD ausente.\n"
            "  PowerShell: $env:PALLEIRA_SFTP_PASSWORD='...'\n"
            "  bash:       export PALLEIRA_SFTP_PASSWORD='...'"
        )
    return senha


def ler_token_do_env(chave: str) -> str:
    """O token vem do .env.local — é o mesmo que a Vercel já serve ao site.

    Escrever no servidor um token diferente do que o site manda daria 401,
    que é um sintoma pior que o ECONNREFUSED: parece que está funcionando.
    """
    with open(".env.local", encoding="utf-8") as f:
        for linha in f:
            if linha.strip().startswith(f"{chave}="):
                return linha.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit(f"{chave} não está em .env.local")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("servidor", choices=sorted(SERVIDORES))
    grupo = p.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--simular", action="store_true", help="só mostra o que faria")
    grupo.add_argument("--aplicar", action="store_true", help="escreve no servidor")
    args = p.parse_args()

    cfg = SERVIDORES[args.servidor]
    token = ler_token_do_env(cfg["env"])

    rest_config = {
        "Version": 3,
        "Enabled": True,
        "LogConsole": False,
        "Address": "0.0.0.0",
        "Port": cfg["porta_rest"],
        "DefaultPermissions": [],
        "Cors": {
            "Comment": "Do not change those unless you know what you are doing!",
            "Allowed-Origins": "*",
            "Max-Age": 86400,
        },
    }
    token_json = {"Name": "PalleiraPortal", "Token": token, "Permissions": PERMISSOES}

    print(f"Servidor : {args.servidor} ({cfg['host']})")
    print(f"Porta    : {cfg['porta_rest']}")
    print(f"Token    : …{token[-8:]} (de {cfg['env']})")
    print(f"\n{BASE}/RESTConfig.json:\n{json.dumps(rest_config, indent=4)}")
    print(f"\n{BASE}/Tokens/PalleiraPortal.json:\n{json.dumps(token_json, indent=2)}")

    if args.simular:
        print("\n[simulação] nada foi escrito.")
        return

    t = paramiko.Transport((cfg["host"], 2022))
    t.connect(username=cfg["user"], password=ler_senha_sftp())
    sf = paramiko.SFTPClient.from_transport(t)
    try:
        try:
            sf.mkdir(f"{BASE}/Tokens")
        except OSError:
            pass  # já existe

        with sf.open(f"{BASE}/RESTConfig.json", "w") as f:
            f.write(json.dumps(rest_config, indent=4))
        with sf.open(f"{BASE}/Tokens/PalleiraPortal.json", "w") as f:
            f.write(json.dumps(token_json, indent=2))
    finally:
        sf.close()
        t.close()

    # Sem emoji de propósito: o console do Windows usa cp1252 e quebra com
    # UnicodeEncodeError *depois* de já ter escrito os arquivos — o que faz
    # uma execução bem-sucedida parecer que falhou.
    print("\nEscrito. Atencao: a REST so sobe no proximo restart do servidor.")
    print("Depois do restart, conferir:")
    print(f"  http://{cfg['host']}:{cfg['porta_rest']}/v1/pdapi/players")


if __name__ == "__main__":
    main()
