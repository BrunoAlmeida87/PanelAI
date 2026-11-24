// Regras do aparelho da tela e-ink (funções puras, sem ESPHome nem hardware).
// Usadas pelos lambdas de panelai-tela.yaml e testadas no computador com
// esphome/testes/panelai_tela_teste.cpp (g++), no CI "Firmware da tela".
#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <string>

namespace panelai {

// Relógio acertado: qualquer instante depois de 14/11/2023 (o relógio do
// ESP32 começa em 1970 até a internet acertar).
constexpr uint32_t HORA_VALIDA = 1700000000u;
// "Chegou a hora": até 2 minutos antes do horário agendado.
constexpr uint32_t FOLGA = 120;
// A última soneca antes de um horário dura no máximo 1 hora (o relógio
// interno atrasa/adianta durante o sono; quanto mais curta, mais certo).
constexpr uint32_t ULTIMA_ETAPA = 3600;
// Fora isso, acorda a cada no máximo 6 horas para acertar o relógio e reler os horários.
constexpr uint32_t SALTO_MAX = 6 * 3600;
// Sem relógio acertado: tenta de novo em 30 minutos.
constexpr uint32_t SEM_HORA = 1800;
// Nunca dorme menos que 1 minuto.
constexpr uint32_t SONECA_MIN = 60;

// Próximas atualizações (segundos UTC), em ordem; 0 = vazio. Vem do config.json.
// O YAML declara a variável global com o mesmo tipo escrito por extenso.
using Agenda = std::array<uint32_t, 24>;

inline bool hora_valida(uint32_t agora) { return agora > HORA_VALIDA; }

/** Chegou a hora da atualização que o aparelho estava esperando? */
inline bool chegou_a_hora(uint32_t agora, uint32_t alvo) {
  return hora_valida(agora) && alvo != 0 && agora + FOLGA >= alvo;
}

/** Primeiro horário da agenda depois de agora (sem contar o que está dentro da folga). 0 = nenhum. */
inline uint32_t proximo_horario(uint32_t agora, const Agenda &agenda) {
  if (!hora_valida(agora)) return 0;
  for (const uint32_t t : agenda) {
    if (t > agora + FOLGA) return t;
  }
  return 0;
}

/** Espera depois de falhas seguidas: 5, 10, 20 e depois 30 minutos. */
inline uint32_t espera_por_falhas(uint8_t falhas) {
  const int passos = std::min<int>(std::max<int>(falhas, 1) - 1, 3);
  return std::min<uint32_t>(1800, 300u << passos);
}

struct Soneca {
  uint32_t segundos;  // quanto dormir
  uint32_t alvo;      // horário esperado ao acordar (0 = nenhum)
};

/**
 * Quanto dormir agora.
 *  - falhou: esta vez não deu certo (sem Wi-Fi ou sem imagem);
 *  - atualizando: esta vez era para redesenhar a tela (horário, botão ou ligado);
 *  - falhas: falhas seguidas, já contando esta.
 * Se a atualização falhou, ela fica pendente (alvo no passado) e é tentada de novo.
 */
inline Soneca calcular_soneca(uint32_t agora, const Agenda &agenda, bool falhou, bool atualizando, uint8_t falhas) {
  const bool tem_hora = hora_valida(agora);
  Soneca s{SEM_HORA, 0};
  if (falhou && atualizando) {
    // Sem relógio acertado, alvo = 1 já conta como "passou da hora" assim que o relógio acertar.
    s.alvo = tem_hora ? agora : 1u;
    s.segundos = espera_por_falhas(falhas);
  } else {
    const uint32_t proximo = proximo_horario(agora, agenda);
    s.alvo = proximo;
    if (!tem_hora) {
      s.segundos = SEM_HORA;
    } else if (proximo == 0) {
      s.segundos = SALTO_MAX;  // sem horários: só relê a agenda de tempos em tempos
    } else {
      const uint32_t falta = proximo - agora;
      s.segundos = falta <= ULTIMA_ETAPA + 300 ? falta : std::min(falta - ULTIMA_ETAPA, SALTO_MAX);
    }
    if (falhou) s.segundos = std::min(s.segundos, espera_por_falhas(falhas));
  }
  s.segundos = std::max(s.segundos, SONECA_MIN);
  return s;
}

/** Endereço colado na página do aparelho, sem espaços nem barra no fim. */
inline std::string limpar_endereco(const std::string &texto) {
  const auto inicio = texto.find_first_not_of(" \t\r\n\"'");
  if (inicio == std::string::npos) return "";
  const auto fim = texto.find_last_not_of(" \t\r\n\"'/");
  return fim < inicio ? "" : texto.substr(inicio, fim - inicio + 1);
}

/** Parece o endereço de Configurações → Tela e-ink (…/tela/<código>)? */
inline bool endereco_valido(const std::string &texto) {
  const std::string e = limpar_endereco(texto);
  const bool http = e.rfind("https://", 0) == 0 || e.rfind("http://", 0) == 0;
  const auto pasta = e.find("/tela/");
  return http && pasta != std::string::npos && e.size() > pasta + 6 + 16;
}

}  // namespace panelai
