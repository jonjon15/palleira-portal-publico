--[[
EsconderPosicao — mod do SERVIDOR (UE4SS), não do jogador.

Por que existe: o servidor manda a posição de TODO jogador para TODO jogador,
no campo `CachedPlayerLocation` do `APalPlayerState` (marcado `Net`). Quem
esconde os que não são da guilda é o próprio jogo, no PC de cada um, pela
função `IsAliveOrDyingFriendPlayers_ByUId`. O mod PlayersOnMap só força essa
função a responder "sim" e o mapa desenha todo mundo.

O que este mod faz: sobrescreve o `CachedPlayerLocation` de todos os
PlayerStates com um ponto falso, para que o que chega nos clientes não
seja a posição de verdade.

⚠️ Efeito colateral conhecido: a GUILDA também perde a posição dos colegas
no mapa — o dado é o mesmo para todo mundo.

⚠️ Incerteza: o jogo reescreve esse campo por dentro (C++, sem função que dê
para interceptar). Se ele reescrever a cada frame, o valor real vaza entre
uma sobrescrita e outra e o ícone "pisca" para quem usa o PlayersOnMap. O
contador `reescritas` no log mede exatamente isso: quantas vezes, desde a
última volta, o jogo tinha posto o valor real de volta.

Desligar: `EsconderPosicao : 0` no ue4ss/Mods/mods.txt e reiniciar.
]]

local MOD = "EsconderPosicao"

local Config = {
    -- "esconder": sobrescreve a posição. "medir": só conta quantas vezes o
    -- jogo muda a posição, sem escrever nada (diagnóstico sem efeito).
    Modo = "medir",
    -- De quanto em quanto tempo sobrescrever. Menor = menos vazamento,
    -- mais CPU. O custo por volta é baixo (só os PlayerStates em cache).
    IntervaloMs = 20,
    -- Ponto falso. (0,0,0) é o centro do mundo.
    PontoFalso = { X = 0.0, Y = 0.0, Z = 0.0 },
    -- Resumo no UE4SS.log a cada N segundos.
    ResumoSegundos = 60,
}

local function log(msg)
    print(string.format("[%s] %s\n", MOD, msg))
end

local estados = {}          -- endereço -> PalPlayerState
local voltas, reescritas, escritas, erros = 0, 0, 0, 0
local ultimo_resumo = os.time()

local function valido(o)
    return o ~= nil and o:IsValid()
end

local function lembrar(ps)
    if valido(ps) then
        local ok, end_ = pcall(function() return ps:GetAddress() end)
        if ok and end_ then estados[end_] = ps end
    end
end

local function varrer_tudo()
    local ok, lista = pcall(FindAllOf, "PalPlayerState")
    if ok and lista then
        for _, ps in ipairs(lista) do lembrar(ps) end
    end
end

local function eh_falso(v)
    return v ~= nil
        and math.abs((v.X or 0) - Config.PontoFalso.X) < 1
        and math.abs((v.Y or 0) - Config.PontoFalso.Y) < 1
        and math.abs((v.Z or 0) - Config.PontoFalso.Z) < 1
end

local function uma_volta()
    voltas = voltas + 1
    for end_, ps in pairs(estados) do
        if not valido(ps) then
            estados[end_] = nil
        else
            local ok, err = pcall(function()
                local atual = ps.CachedPlayerLocation
                if not eh_falso(atual) then
                    reescritas = reescritas + 1
                    if Config.Modo == "esconder" then
                        ps.CachedPlayerLocation = {
                            X = Config.PontoFalso.X,
                            Y = Config.PontoFalso.Y,
                            Z = Config.PontoFalso.Z,
                        }
                        escritas = escritas + 1
                    end
                end
            end)
            if not ok then
                erros = erros + 1
                if erros <= 5 then log("erro ao ler/escrever: " .. tostring(err)) end
            end
        end
    end

    if os.time() - ultimo_resumo >= Config.ResumoSegundos then
        ultimo_resumo = os.time()
        local n = 0
        for _ in pairs(estados) do n = n + 1 end
        log(string.format(
            "modo=%s jogadores=%d voltas=%d reescritas_pelo_jogo=%d escritas=%d erros=%d",
            Config.Modo, n, voltas, reescritas, escritas, erros))
        voltas, reescritas, escritas = 0, 0, 0
        varrer_tudo() -- rede de segurança contra PlayerState que o aviso perdeu
    end
end

local function agendar()
    ExecuteWithDelay(Config.IntervaloMs, function()
        ExecuteInGameThread(function()
            local ok, err = pcall(uma_volta)
            if not ok then log("volta falhou: " .. tostring(err)) end
            agendar()
        end)
    end)
end

local ok_aviso, err_aviso = pcall(function()
    NotifyOnNewObject("/Script/Pal.PalPlayerState", function(ps) lembrar(ps) end)
end)
if not ok_aviso then log("sem aviso de PlayerState novo: " .. tostring(err_aviso)) end

ExecuteInGameThread(varrer_tudo)
agendar()
log(string.format("carregado. modo=%s intervalo=%dms", Config.Modo, Config.IntervaloMs))
