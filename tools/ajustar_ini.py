#!/usr/bin/env python3
"""
Muda uma ou mais chaves do `PalWorldSettings.ini` de um servidor.

O arquivo é uma linha só: um `OptionSettings=(...)` gigante com tudo dentro,
separado por vírgula. Editar à mão é fácil de errar — daí esta ferramenta,
que troca pelo nome da chave e confere o resultado antes de gravar.

⚠️ **O `.ini` só é lido no boot.** Gravar com o servidor no ar não muda nada,
e pior: o Palworld **reescreve o arquivo ao desligar**, então uma edição feita
com o servidor rodando é perdida no próximo stop. A ordem certa é: servidor
parado → editar → subir. Por isso o `--aplicar` recusa mexer num servidor que
está no ar, a não ser com `--servidor-parado`.

Uso:
    python tools/ajustar_ini.py --servidor pvp-free \\
        --set bEnablePlayerToPlayerDamage=True --simular
"""

from __future__ import annotations

import argparse
import re
import sys

import paramiko

INI = "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini"

SERVIDORES = {
    "pve-free": ("enx-soc-20.enx.host", "qv6mfi1u.0c079595"),
    "pve-vip": ("enx-cirion-30.enx.host", "qv6mfi1u.6eb8d521"),
    "pvp-free": ("enx-cirion-16.enx.host", "qv6mfi1u.59ec87fa"),
}


def senha_sftp() -> str:
    """Nunca hardcoded: este repositório é público."""
    import os

    s = os.environ.get("PALLEIRA_SFTP_PASSWORD", "")
    if not s:
        raise SystemExit(
            "PALLEIRA_SFTP_PASSWORD ausente.\n"
            "  PowerShell: $env:PALLEIRA_SFTP_PASSWORD='...'"
        )
    return s


def trocar(texto: str, chave: str, valor: str) -> tuple[str, str]:
    """Troca `chave=<algo>` dentro do OptionSettings. Devolve (novo, antigo)."""
    padrao = rf"({re.escape(chave)}=)([^,\)]*)"
    m = re.search(padrao, texto)
    if not m:
        raise SystemExit(f"chave {chave!r} não encontrada no .ini")
    return re.sub(padrao, rf"\g<1>{valor}", texto, count=1), m.group(2)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--servidor", required=True, choices=sorted(SERVIDORES))
    p.add_argument("--set", action="append", required=True, metavar="CHAVE=VALOR",
                   help="pode repetir")
    p.add_argument("--servidor-parado", action="store_true",
                   help="confirma que o servidor está desligado (ver o aviso no topo)")
    grupo = p.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--simular", action="store_true")
    grupo.add_argument("--aplicar", action="store_true")
    args = p.parse_args()

    if args.aplicar and not args.servidor_parado:
        sys.exit(
            "Recusado: o Palworld reescreve o .ini ao desligar, então editar com\n"
            "o servidor no ar perde a mudança. Pare o servidor pelo painel e\n"
            "repita com --servidor-parado."
        )

    host, user = SERVIDORES[args.servidor]
    t = paramiko.Transport((host, 2022))
    t.connect(username=user, password=senha_sftp())
    sf = paramiko.SFTPClient.from_transport(t)
    try:
        texto = sf.open(INI).read().decode("utf-8", "replace")
        original = texto

        print(f"{args.servidor}: {INI}\n")
        for par in args.set:
            if "=" not in par:
                sys.exit(f"--set espera CHAVE=VALOR, recebi {par!r}")
            chave, valor = par.split("=", 1)
            texto, antigo = trocar(texto, chave, valor)
            marca = "(sem mudança)" if antigo == valor else ""
            print(f"  {chave}: {antigo} -> {valor} {marca}")

        if args.simular:
            print("\n[simulação] nada foi escrito.")
            return 0

        # Backup antes de tocar: este arquivo tem a config inteira do mundo.
        from datetime import datetime

        carimbo = datetime.now().strftime("%Y%m%d%H%M%S")
        bak = f"{INI}.bak-{carimbo}"
        with sf.open(bak, "w") as f:
            f.write(original)
        print(f"\nbackup: {bak}")

        with sf.open(INI, "w") as f:
            f.write(texto)

        # Confere lendo de volta, não confia na escrita.
        conferido = sf.open(INI).read().decode("utf-8", "replace")
        for par in args.set:
            chave, valor = par.split("=", 1)
            m = re.search(rf"{re.escape(chave)}=([^,\)]*)", conferido)
            ok = m and m.group(1) == valor
            print(f"  conferido {chave}={m.group(1) if m else '?'} {'OK' if ok else 'FALHOU'}")
    finally:
        sf.close()
        t.close()

    print("\nGravado. Suba o servidor pelo painel para valer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
