<template>
  <div class="rc-hud" :class="{ 'rc-hud--mobile': mobile }">
    <!-- Canto superior esquerdo: coordenadas, bioma, relógio, desempenho -->
    <div class="rc-hud__top">
      <div class="rc-hud__chip">
        <RCIcon nome="bussola" :size="11" />
        {{ Math.round(pos.x) }} · {{ Math.round(pos.y) }} · {{ Math.round(pos.z) }}
      </div>
      <div class="rc-hud__chip">
        <RCIcon :nome="isNightNow ? 'lua' : 'sol'" :size="11" />
        {{ clock }}
      </div>
      <div v-if="biomeLabel" class="rc-hud__chip rc-hud__chip--biome">
        <RCIcon nome="montanha" :size="11" />{{ biomeLabel }}
      </div>
      <div v-if="showStats" class="rc-hud__chip rc-hud__chip--stats">
        {{ fps }} fps · {{ chunks }} ch
      </div>
      <button v-if="mpActive" class="rc-hud__chip rc-hud__chip--mp" @click="$emit('lobby')">
        <RCIcon nome="gente" :size="11" />{{ mpPlayers }}
      </button>
    </div>

    <!-- O minimapa. Mora DENTRO do HUD porque some com ele: no menu inicial,
         um mapa por cima da cena denunciaria que o menu é overlay, exatamente
         como a vida e a hotbar denunciariam. -->
    <RCMinimapa v-model:minimapa="minimapa" :pos="pos" :mobile="mobile" />

    <!-- Barras de sobrevivência -->
    <div v-if="survivalMode" class="rc-hud__vitals">
      <!-- A armadura, acima da vida: um pino por 2 pontos, como no original. -->
      <div
        v-if="armadura > 0"
        class="rc-hud__bar rc-hud__bar--armadura"
        :aria-label="`${t('roqueCraft.hud.armor')} ${armadura}`"
        data-test="rc-hud-armadura"
      >
        <span
          v-for="i in 10"
          :key="`a${i}`"
          class="rc-hud__pip rc-hud__pip--armadura"
          :class="pipClass(armadura, i)"
        />
      </div>
      <div class="rc-hud__bar rc-hud__bar--health" :aria-label="t('roqueCraft.hud.health')">
        <span
          v-for="i in 10"
          :key="`h${i}`"
          class="rc-hud__pip rc-hud__pip--heart"
          :class="pipClass(health, i)"
        />
      </div>
      <div class="rc-hud__bar rc-hud__bar--hunger" :aria-label="t('roqueCraft.hud.hunger')">
        <span
          v-for="i in 10"
          :key="`f${i}`"
          class="rc-hud__pip rc-hud__pip--food"
          :class="pipClass(hunger, i)"
        />
      </div>
      <div
        v-if="air < 300"
        class="rc-hud__bar rc-hud__bar--air"
        :aria-label="t('roqueCraft.hud.air')"
      >
        <span
          v-for="i in 10"
          :key="`a${i}`"
          class="rc-hud__pip rc-hud__pip--air"
          :class="{ 'is-empty': air / 30 < i }"
        />
      </div>
    </div>

    <!-- Barra de experiência -->
    <div v-if="survivalMode" class="rc-hud__xp">
      <div class="rc-hud__xp-track"><div class="rc-hud__xp-fill" :style="{ width: xpPct }" /></div>
      <span v-if="level > 0" class="rc-hud__xp-level">{{ level }}</span>
    </div>

    <!-- Hotbar -->
    <div class="rc-hud__hotbar">
      <button
        v-for="(slot, i) in hotbar"
        :key="i"
        class="rc-hud__slot"
        :class="{ 'is-selected': i === selected }"
        :title="slot ? nomeDaPilha(slot, t) : ''"
        :aria-label="slot ? nomeDaPilha(slot, t) : t('roqueCraft.hud.emptySlot')"
        @click="$emit('select', i)"
        @touchstart.prevent="segurarSlot(i)"
        @touchmove="cancelarSlot"
        @touchend.prevent="soltarSlot(i)"
        @touchcancel="cancelarSlot"
        @contextmenu.prevent
      >
        <img
          v-if="slot && iconFor(slot.item)"
          :src="iconFor(slot.item)"
          :alt="nomeDaPilha(slot, t)"
        />
        <!-- BORRIFO. A poção de arremesso era PIXEL POR PIXEL igual à de
             beber: o mesmo frasco, a mesma cor, e a única diferença ficava no
             rótulo que só aparece ao passar o mouse — num jogo que se joga com
             a mão na hotbar e o olho na tela. Um jogador com as duas na barra
             tomava a de jogar e jogava a de tomar.

             Marca DERIVADA, sem arte nova (arte está congelada): um risco na
             diagonal do canto, que é o gesto de arremessar. `aria-hidden`
             porque o `aria-label` do botão já diz "Borrifo: …" em texto. -->
        <span
          v-if="slot && slot.pocao && slot.pocao.splash"
          class="rc-hud__slot-splash"
          aria-hidden="true"
        />
        <span v-if="slot && slot.count > 1" class="rc-hud__slot-count">{{ slot.count }}</span>
        <span v-if="slot && slot.dur != null" class="rc-hud__slot-dur">
          <i :style="{ width: durPct(slot) }" />
        </span>
        <span class="rc-hud__slot-key">{{ i + 1 }}</span>
      </button>
    </div>

    <!-- Nome do item selecionado (aparece e some) -->
    <transition name="rc-fade">
      <div v-if="itemToast" class="rc-hud__item-toast">{{ itemToast }}</div>
    </transition>

    <!-- Recado da cama. Prop própria, e não o mesmo `itemToast`: os dois
         aparecem no mesmo canto mas têm donos e tempos diferentes, e trocar de
         slot da hotbar apagaria o "não dá pra dormir agora" no meio da leitura. -->
    <transition name="rc-fade">
      <div v-if="bedToast" class="rc-hud__bed-toast">{{ bedToast }}</div>
    </transition>
  </div>
</template>

<script setup>
import RCIcon from './RCIcon.vue'
import RCMinimapa from './RCMinimapa.vue'
import { computed, onUnmounted } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { itemDef } from '../servicos/items.js'
import { nomeDaPilha } from '../servicos/rotulo.js'

const props = defineProps({
  pos: { type: Object, required: true },
  clock: { type: String, default: '' },
  isNightNow: { type: Boolean, default: false },
  biomeLabel: { type: String, default: '' },
  fps: { type: Number, default: 0 },
  chunks: { type: Number, default: 0 },
  showStats: { type: Boolean, default: false },
  survivalMode: { type: Boolean, default: true },
  health: { type: Number, default: 20 },
  /** Pontos de armadura vestida (0..20). */
  armadura: { type: Number, default: 0 },
  hunger: { type: Number, default: 20 },
  air: { type: Number, default: 300 },
  level: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  hotbar: { type: Array, default: () => [] },
  selected: { type: Number, default: 0 },
  icons: { type: Object, default: () => ({}) },
  itemToast: { type: String, default: '' },
  bedToast: { type: String, default: '' },
  mpActive: { type: Boolean, default: false },
  mpPlayers: { type: Number, default: 1 },
  mobile: { type: Boolean, default: false },
})

/** Só de passagem: quem lê e escreve é o `RCMinimapa`, o dono é o `settings`. */
const minimapa = defineModel('minimapa', { type: Boolean, required: false })

const emit = defineEmits(['select', 'lobby', 'largar'])

const t = useTextos()

/**
 * TOQUE LONGO NO SLOT = LARGAR (o Q do teclado); TOQUE CURTO = SELECIONAR.
 *
 * ⚠️ O toque não tinha como largar item: era gesto só de tecla (Goal 21).
 * 600 ms é o "segurar" do iOS e do Android. O slot é SELECIONADO antes de
 * largar, porque `largarDaMao` solta o que está na mão — sem isso, segurar o
 * slot 3 com o 1 na mão largaria o item do 1.
 *
 * ⚠️ `touchstart.prevent`, E POR ISSO O TOQUE CURTO SELECIONA À MÃO. Sem o
 * `prevent`, o navegador trata o dedo parado como o gesto DELE (menu de
 * contexto, seleção de texto) e manda `touchcancel` antes dos 600 ms: a sonda
 * do toque mediu o dedo segurando 750 ms e o item continuando na mão. Com o
 * `prevent` o clique sintético não vem, então quem seleciona no toque curto é
 * o `touchend`. O `@click` continua para o mouse.
 */
const TOQUE_LONGO_MS = 600
let segurando = null
function segurarSlot(i) {
  cancelarSlot()
  segurando = setTimeout(() => {
    segurando = null
    emit('select', i)
    emit('largar', i)
  }, TOQUE_LONGO_MS)
}
function cancelarSlot() {
  if (segurando) clearTimeout(segurando)
  segurando = null
}
function soltarSlot(i) {
  // Timer ainda vivo = o dedo saiu antes dos 600 ms: é um toque, seleciona.
  if (segurando) emit('select', i)
  cancelarSlot()
}
// O HUD some quando o menu inicial volta (`naPartida`): um dedo no slot nessa
// hora não pode largar item num componente que já não existe. O Vue 3 já
// engole `emit` de instância desmontada — por isso NÃO há teste disto: dois
// mutantes (com e sem esta linha) passaram iguais, e teste que não reprova não
// é teste. A linha fica por higiene: timer vivo em componente morto é lixo.
onUnmounted(cancelarSlot)

const xpPct = computed(() => `${Math.round(props.xp * 100)}%`)

// Cada "pip" vale 2 pontos: cheio, metade ou vazio - o coração pela metade é o
// que dá a leitura instantânea de "estou quase morrendo".
const pipClass = (value, i) => {
  const full = value >= i * 2
  const half = !full && value >= i * 2 - 1
  return { 'is-full': full, 'is-half': half, 'is-empty': !full && !half }
}

const iconFor = (key) => props.icons[key] || null
const durPct = (slot) => {
  const def = itemDef(slot.item)
  if (!def?.durability) return '100%'
  return `${Math.max(0, Math.min(100, (slot.dur / def.durability) * 100))}%`
}
</script>

<style lang="scss" scoped>
@import './styles/rc-hud.scss';
</style>
