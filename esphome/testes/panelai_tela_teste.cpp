// Testes das regras do aparelho (esphome/panelai_tela.h), sem hardware.
// Rodar: g++ -std=c++17 -Wall -Wextra -Werror -I esphome esphome/testes/panelai_tela_teste.cpp -o /tmp/t && /tmp/t

#include "panelai_tela.h"

#include <cstdio>
#include <cstdlib>

using namespace panelai;

static int falhas_teste = 0;
#define CONFERE(cond)                                                       \
  do {                                                                      \
    if (!(cond)) {                                                          \
      std::fprintf(stderr, "FALHOU (linha %d): %s\n", __LINE__, #cond);   \
      falhas_teste++;                                                       \
    }                                                                       \
  } while (0)

// 25/11/2026 10:00 em São Paulo = 13:00 UTC
constexpr uint32_t AGORA = 1795611600u;
constexpr uint32_t H = 3600;

static Agenda agenda(std::initializer_list<uint32_t> v) {
  Agenda a{};
  size_t i = 0;
  for (auto t : v) a[i++] = t;
  return a;
}

int main() {
  // Relógio
  CONFERE(!hora_valida(0));
  CONFERE(hora_valida(AGORA));
  CONFERE(chegou_a_hora(AGORA, AGORA + 60));    // 1 min antes: já é a hora
  CONFERE(!chegou_a_hora(AGORA, AGORA + 600));  // 10 min antes: ainda não
  CONFERE(!chegou_a_hora(AGORA, 0));
  CONFERE(!chegou_a_hora(100, 50));             // sem relógio, nunca

  // Próximo horário ignora o que já passou e o que está na folga
  const Agenda a = agenda({AGORA - H, AGORA + 60, AGORA + 8 * H, AGORA + 20 * H});
  CONFERE(proximo_horario(AGORA, a) == AGORA + 8 * H);
  CONFERE(proximo_horario(0, a) == 0);
  CONFERE(proximo_horario(AGORA, Agenda{}) == 0);

  // Longe do horário: dorme até 1 h antes (no máximo 6 h por vez)
  {
    const Soneca s = calcular_soneca(AGORA, agenda({AGORA + 20 * H}), false, true, 0);
    CONFERE(s.segundos == SALTO_MAX);
    CONFERE(s.alvo == AGORA + 20 * H);
  }
  {
    const Soneca s = calcular_soneca(AGORA, agenda({AGORA + 3 * H}), false, false, 0);
    CONFERE(s.segundos == 2 * H);  // acorda 1 h antes para acertar o relógio
  }
  // Perto do horário (até 1 h 05): dorme direto até ele
  {
    const Soneca s = calcular_soneca(AGORA, agenda({AGORA + 40 * 60}), false, false, 0);
    CONFERE(s.segundos == 40 * 60);
    CONFERE(s.alvo == AGORA + 40 * 60);
  }
  // Sem horários: relê a agenda a cada 6 h
  {
    const Soneca s = calcular_soneca(AGORA, Agenda{}, false, false, 0);
    CONFERE(s.segundos == SALTO_MAX && s.alvo == 0);
  }
  // Sem relógio e sem falha: 30 min
  {
    const Soneca s = calcular_soneca(0, agenda({AGORA + H}), false, false, 0);
    CONFERE(s.segundos == SEM_HORA && s.alvo == 0);
  }
  // Sem relógio e a atualização falhou: tenta em 5 min e continua pendente quando o relógio acertar
  {
    const Soneca s = calcular_soneca(0, agenda({AGORA + H}), true, true, 1);
    CONFERE(s.segundos == 300 && s.alvo == 1);
    CONFERE(!chegou_a_hora(300, s.alvo));
    CONFERE(chegou_a_hora(AGORA, s.alvo));
  }
  // Atualização falhou: fica pendente (alvo = agora) e tenta em 5, 10, 20, 30, 30 min
  {
    const uint32_t esperado[] = {300, 600, 1200, 1800, 1800};
    for (uint8_t f = 1; f <= 5; f++) {
      const Soneca s = calcular_soneca(AGORA, agenda({AGORA + 8 * H}), true, true, f);
      CONFERE(s.segundos == esperado[f - 1]);
      CONFERE(s.alvo == AGORA);
      CONFERE(chegou_a_hora(AGORA + s.segundos, s.alvo));  // ao acordar, tenta de novo
    }
  }
  // Acordada no meio do caminho sem Wi-Fi: não perde o horário (espera curta, mesmo alvo)
  {
    const Soneca s = calcular_soneca(AGORA, agenda({AGORA + 20 * 60}), true, false, 1);
    CONFERE(s.segundos == 300 && s.alvo == AGORA + 20 * 60);
  }
  // Horário logo depois da folga: dorme exatamente até ele (e nunca menos de 1 minuto)
  CONFERE(calcular_soneca(AGORA, agenda({AGORA + FOLGA + 10}), false, false, 0).segundos == FOLGA + 10);
  CONFERE(calcular_soneca(AGORA, agenda({AGORA + FOLGA + 10}), false, false, 0).segundos >= SONECA_MIN);

  // Endereço colado na página do aparelho
  const std::string ok = "https://exemplo.github.io/PanelAI/tela/AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  CONFERE(limpar_endereco("  " + ok + "/ \n") == ok);
  CONFERE(limpar_endereco("\"" + ok + "\"") == ok);
  CONFERE(limpar_endereco("   ").empty());
  CONFERE(endereco_valido(ok));
  CONFERE(endereco_valido(" " + ok + "/"));
  CONFERE(!endereco_valido("https://exemplo.github.io/PanelAI/"));
  CONFERE(!endereco_valido("exemplo.github.io/PanelAI/tela/AbCdEfGhIjKlMnOpQrStUvWxYz012345"));
  CONFERE(!endereco_valido("https://exemplo.github.io/PanelAI/tela/curto"));

  if (falhas_teste) {
    std::fprintf(stderr, "%d verificação(ões) falharam\n", falhas_teste);
    return EXIT_FAILURE;
  }
  std::printf("Regras do aparelho: todas as verificações passaram\n");
  return EXIT_SUCCESS;
}
