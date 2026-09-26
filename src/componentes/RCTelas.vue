<template>
  <!-- A tela de comércio: irmã da de mobília, e aberta pelo mesmo clique. -->
  <RCComercio
    v-if="aldeaoAberto"
    :conversa="conversa"
    :ofertas="ofertas"
    :icons="icons"
    @close="$emit('fechar-comercio')"
    @acao="(...a) => $emit('acao-aldeao', ...a)"
  />

  <RCCriativo v-if="criativo.aberto.value" v-bind="criativo.vista.value" v-on="criativo.acoes" />

  <RCContainer
    v-if="mobilia"
    :tipo="mobilia.tipo"
    :conteudo="conteudo"
    :slots="slots"
    :fogo="fogo"
    :progresso="progresso"
    :cursor="ponteiro.cursor"
    :mouse="ponteiro.mouse"
    :icons="icons"
    @close="$emit('fechar-mobilia')"
    @container-click="(...a) => $emit('container-click', ...a)"
    @slot-click="(...a) => $emit('slot-click', ...a)"
  />

  <RCInventory
    v-if="inventarioAberto"
    :slots="slots"
    :craft="craft"
    :grid-size="gridSize"
    :has-table="gridSize === 3"
    :result="resultado"
    :cursor="ponteiro.cursor"
    :mouse="ponteiro.mouse"
    :icons="icons"
    :craftable="craftaveis"
    :creative="criativoLigado"
    :all-blocks="todosOsBlocos"
    :armadura="armadura"
    @close="$emit('fechar-inventario')"
    @slot-click="(...a) => $emit('slot-click', ...a)"
    @craft-click="(...a) => $emit('craft-click', ...a)"
    @take-result="$emit('pegar-resultado')"
    @auto-craft="(...a) => $emit('auto-craft', ...a)"
    @give="(...a) => $emit('dar', ...a)"
  />
</template>

<script setup>
//
// AS TELAS SOBREPOSTAS DO JOGO, num lugar só.
//
// ⚠️ ELAS SAÍRAM DO `ROSRoqueCraft.vue` PORQUE A CATRACA DE TAMANHO RECUSOU, e
// a catraca estava certa: o componente tem 2.4 mil linhas e a regra é dividir
// antes de adicionar. O painel de criativo foi a gota — 25 linhas que não
// cabiam.
//
// Este arquivo é FIAÇÃO e nada mais: nenhuma decisão de jogo mora aqui, nenhum
// estado nasce aqui. Quem decide continua sendo o componente e os composables.
// Por isso ele repassa evento por evento em vez de agir: uma tela que resolvesse
// o próprio clique seria um segundo dono para uma regra que já tem dono.
//
import RCComercio from './RCComercio.vue'
import RCCriativo from './RCCriativo.vue'
import RCContainer from './RCContainer.vue'
import RCInventory from './RCInventory.vue'

defineProps({
  icons: { type: Object, default: () => ({}) },
  // Comércio
  aldeaoAberto: { type: [Object, Boolean, String, Number], default: null },
  conversa: { type: Object, default: null },
  ofertas: { type: Array, default: () => [] },
  // Criativo (o composable inteiro: ele já traz `vista` e `acoes` prontos)
  criativo: { type: Object, required: true },
  // Mobília
  mobilia: { type: Object, default: null },
  conteudo: { type: Array, default: null },
  fogo: { type: Object, default: null },
  progresso: { type: Number, default: 0 },
  // Inventário
  inventarioAberto: { type: Boolean, default: false },
  slots: { type: Array, default: () => [] },
  armadura: { type: Object, default: null },
  craft: { type: Array, default: () => [] },
  gridSize: { type: Number, default: 2 },
  resultado: { type: Object, default: null },
  craftaveis: { type: [Array, Object, Set], default: null },
  criativoLigado: { type: Boolean, default: false },
  todosOsBlocos: { type: Array, default: () => [] },
  // Comuns às três telas: o par anda sempre junto, então viaja junto.
  ponteiro: { type: Object, default: () => ({ cursor: null, mouse: null }) },
})

defineEmits([
  'fechar-comercio',
  'acao-aldeao',
  'fechar-mobilia',
  'container-click',
  'slot-click',
  'fechar-inventario',
  'craft-click',
  'pegar-resultado',
  'auto-craft',
  'dar',
])
</script>
