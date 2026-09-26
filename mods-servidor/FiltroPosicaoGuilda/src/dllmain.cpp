// FiltroPosicaoGuilda — mod C++ do SERVIDOR (UE4SS).
//
// Objetivo final: o servidor mandar a ficha (APalPlayerState, que carrega o
// CachedPlayerLocation) de cada jogador só para quem é da mesma guilda. Hoje
// o nó PalReplicationGraphNode_PlayerStateFrequencyLimiter manda a de todos
// para todos, e é isso que o mod PlayersOnMap aproveita.
//
// FASE 1 (este arquivo): só reconhecimento, sem gancho nenhum. Prova que a
// DLL compilada no Actions carrega no servidor da ENX (Wine) e registra no
// UE4SS.log os objetos do ReplicationGraph e a tabela virtual do nó — o
// material para escolher, na fase 2, qual função interceptar.

#include <Mod/CppUserModBase.hpp>
#include <DynamicOutput/DynamicOutput.hpp>
#include <Unreal/UObjectGlobals.hpp>
#include <Unreal/UObject.hpp>

#include <Windows.h>

#include <chrono>
#include <cstdint>
#include <vector>

using namespace RC;
using namespace RC::Unreal;

class FiltroPosicaoGuilda : public CppUserModBase
{
    std::chrono::steady_clock::time_point m_inicio{};
    bool m_relatado{false};

    static constexpr auto ESPERA = std::chrono::seconds(90);
    static constexpr int ENTRADAS_VTABLE = 160;

  public:
    FiltroPosicaoGuilda() : CppUserModBase()
    {
        ModName = STR("FiltroPosicaoGuilda");
        ModVersion = STR("0.1-reconhecimento");
        ModDescription = STR("Filtra a posicao dos jogadores por guilda (fase 1: so reconhecimento)");
        ModAuthors = STR("Palleira");
        m_inicio = std::chrono::steady_clock::now();
    }

    ~FiltroPosicaoGuilda() override = default;

    auto on_unreal_init() -> void override
    {
        Output::send<LogLevel::Normal>(STR("[FiltroPosicaoGuilda] carregado; relatorio em {} s\n"),
                                       static_cast<int>(ESPERA.count()));
    }

    auto on_update() -> void override
    {
        if (m_relatado || std::chrono::steady_clock::now() - m_inicio < ESPERA)
        {
            return;
        }
        m_relatado = true;

        const auto base = reinterpret_cast<uintptr_t>(GetModuleHandleW(nullptr));
        Output::send<LogLevel::Normal>(STR("[FiltroPosicaoGuilda] base do executavel: {:#x}\n"), base);

        relatar(STR("PalReplicationGraph"), base, false);
        relatar(STR("PalReplicationGraphNode_PlayerStateFrequencyLimiter"), base, true);
        relatar(STR("PalPlayerState"), base, false);
    }

  private:
    static auto relatar(const StringType& classe, uintptr_t base, bool com_vtable) -> void
    {
        std::vector<UObject*> achados{};
        UObjectGlobals::FindAllOf(classe, achados);
        Output::send<LogLevel::Normal>(STR("[FiltroPosicaoGuilda] {}: {} objeto(s)\n"), classe, achados.size());

        for (UObject* obj : achados)
        {
            if (!obj)
            {
                continue;
            }
            uintptr_t* vtable = *reinterpret_cast<uintptr_t**>(obj);
            Output::send<LogLevel::Normal>(STR("[FiltroPosicaoGuilda]   {} vtable=+{:#x}\n"),
                                           obj->GetFullName(),
                                           reinterpret_cast<uintptr_t>(vtable) - base);
            if (!com_vtable)
            {
                continue;
            }
            for (int i = 0; i < ENTRADAS_VTABLE; ++i)
            {
                Output::send<LogLevel::Normal>(STR("[FiltroPosicaoGuilda]     vt[{}]=+{:#x}\n"), i, vtable[i] - base);
            }
            break; // um nó basta: todos compartilham a mesma tabela
        }
    }
};

#define MOD_EXPORT __declspec(dllexport)
extern "C"
{
    MOD_EXPORT RC::CppUserModBase* start_mod()
    {
        return new FiltroPosicaoGuilda();
    }

    MOD_EXPORT void uninstall_mod(RC::CppUserModBase* mod)
    {
        delete mod;
    }
}
