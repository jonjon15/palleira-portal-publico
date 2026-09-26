cmake_minimum_required(VERSION 3.22)
set(TARGET FiltroPosicaoGuilda)
project(${TARGET})

# Compilado DENTRO da árvore do RE-UE4SS (pasta cppmods/), no mesmo commit do
# UE4SS do servidor — ver .github/workflows/compilar-mod-servidor.yml.
add_library(${TARGET} SHARED
        src/dllmain.cpp
)

target_link_libraries(${TARGET} PUBLIC UE4SS)
