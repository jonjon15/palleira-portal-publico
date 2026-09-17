@echo off
REM Roda o vigia de resgate de Pal local (tools/entregar_pals_local.py) em
REM loop, enquanto o GitHub Actions da conta estiver bloqueado por billing.
REM
REM So funciona com esta maquina ligada. Fechar a janela para parar.

setlocal enabledelayedexpansion
cd /d "%~dp0.."

for /f "usebackq tokens=1,* delims==" %%A in (".env.pals-local") do (
    set "%%A=%%B"
)

set PYTHONIOENCODING=utf-8
python -X utf8 tools\entregar_pals_local.py >> tools\entregar_pals_local.log 2>&1
