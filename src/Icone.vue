<template>
  <svg
    class="icone-roquecraft"
    :width="tamanho"
    :height="tamanho"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <component
      :is="tag"
      v-for="([tag, attrs], i) in DESENHOS[nome] || []"
      :key="i"
      v-bind="attrs"
    />
  </svg>
</template>

<script>
const p = (d) => ['path', { d }]
const circulo = (cx, cy, r) => ['circle', { cx, cy, r }]

// Os dois `q-icon` do Material que a tela de erro do RoqueCraft usava. O resto
// do jogo desenha os próprios ícones em pixel (`componentes/icones.js`); estes
// dois ficam no traço comum dos jogos da roqueos-games (viewBox 24, traço 2,
// pontas redondas), porque a tela de erro é do sistema de janelas, não do mundo.
export const DESENHOS = Object.freeze({
  // error_outline. Desenhado para o RoqueCraft (não está no catálogo comum).
  alerta: [circulo(12, 12, 8.5), p('M12 7.5v5.5'), p('M12 16.5h.01')],
  // refresh, do catálogo comum (`reiniciar`).
  reiniciar: [p('M5.2 13.5a7 7 0 1 0 1.9-6.4'), p('M4.5 4v4.5H9')],
})
</script>

<script setup>
defineProps({
  nome: {
    type: String,
    required: true,
    validator: (v) => v in DESENHOS,
  },
  tamanho: { type: [Number, String], default: 24 },
})
</script>

<style scoped>
.icone-roquecraft {
  display: inline-block;
  flex: none;
  vertical-align: middle;
}
</style>
