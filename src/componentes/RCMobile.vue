<template>
  <div class="rc-mob">
    <!-- Analógico de movimento (metade esquerda) -->
    <div
      ref="stickEl"
      class="rc-mob__stick"
      :aria-label="t('roqueCraft.move')"
      @touchstart.prevent="onStart"
      @touchmove.prevent="onMove"
      @touchend.prevent="onEnd"
      @touchcancel.prevent="onEnd"
    >
      <div class="rc-mob__knob" :style="knobStyle" />
    </div>

    <!-- Botões de ação (metade direita) -->
    <div class="rc-mob__actions">
      <button
        class="rc-mob__btn rc-mob__btn--break"
        :aria-label="t('roqueCraft.mobile.break')"
        @touchstart.prevent="$emit('break-start')"
        @touchend.prevent="$emit('break-end')"
        @touchcancel.prevent="$emit('break-end')"
      >
        <RCIcon nome="picareta" :size="22" />
      </button>
      <button
        class="rc-mob__btn rc-mob__btn--jump"
        :aria-label="t('roqueCraft.keys.jump')"
        @touchstart.prevent="$emit('jump', true)"
        @touchend.prevent="$emit('jump', false)"
        @touchcancel.prevent="$emit('jump', false)"
      >
        <RCIcon nome="pular" :size="22" />
      </button>
      <!-- MERGULHAR. Só existe dentro d'água, e por isso ele existe: o celular
           não tem Shift, então sem este botão a única entrada vertical no
           touch era o pular — dava pra subir e nunca descer. Aparece quando a
           água entra e some quando ela sai, pra não roubar polegar de quem
           está andando em terra firme. -->
      <button
        v-if="naAgua"
        class="rc-mob__btn rc-mob__btn--dive"
        :aria-label="t('roqueCraft.mobile.dive')"
        @touchstart.prevent="$emit('dive', true)"
        @touchend.prevent="$emit('dive', false)"
        @touchcancel.prevent="$emit('dive', false)"
      >
        <RCIcon nome="mergulhar" :size="22" />
      </button>
      <button
        class="rc-mob__btn rc-mob__btn--place"
        :aria-label="t('roqueCraft.mobile.place')"
        @touchstart.prevent="$emit('place-start')"
        @touchend.prevent="$emit('place-end')"
        @touchcancel.prevent="$emit('place-end')"
      >
        <RCIcon nome="colocar" :size="22" />
      </button>
    </div>

    <!-- Barra superior direita: inventário, voo e PAUSA (sem Esc no celular, o
         menu ficaria inalcançável - lição da regra 36-games).

         ⚠️ E O QUE O TECLADO ALCANÇA, O TOQUE ALCANÇA (Goal 21). Reger o mundo
         (K) e o chat (T) nasceram só no teclado; no iPhone, onde o founder
         joga, o painel de clima e a conversa da sala não existiam. Cada botão
         aparece só quando a ação existe: reger no criativo, chat em rede. -->
    <div class="rc-mob__top">
      <button
        class="rc-mob__mini"
        data-test="rc-mob-inventario"
        :aria-label="t('roqueCraft.keys.inventory')"
        @touchstart.prevent="$emit('inventory')"
      >
        <RCIcon nome="bau" :size="17" />
      </button>
      <button
        class="rc-mob__mini"
        :class="{ 'is-on': flying }"
        data-test="rc-mob-voar"
        :aria-label="t('roqueCraft.keys.fly')"
        @touchstart.prevent="$emit('fly')"
      >
        <RCIcon nome="voar" :size="17" />
      </button>
      <button
        v-if="criativo"
        class="rc-mob__mini"
        data-test="rc-mob-reger"
        :aria-label="t('roqueCraft.criativo.titulo')"
        @touchstart.prevent="$emit('criativo')"
      >
        <RCIcon nome="nuvem" :size="17" />
      </button>
      <button
        v-if="emRede"
        class="rc-mob__mini"
        data-test="rc-mob-chat"
        :aria-label="t('roqueCraft.mp.chatPlaceholder')"
        @touchstart.prevent="$emit('chat')"
      >
        <RCIcon nome="balao" :size="17" />
      </button>
      <button
        class="rc-mob__mini"
        data-test="rc-mob-pausa"
        :aria-label="t('roqueCraft.pause.title')"
        @touchstart.prevent="$emit('pause')"
      >
        <RCIcon nome="pausa" :size="17" />
      </button>
    </div>
  </div>
</template>

<script setup>
import RCIcon from './RCIcon.vue'
import { ref, computed } from 'vue'
import { useTextos } from '../textosDoJogo.js'

defineProps({
  flying: { type: Boolean, default: false },
  naAgua: { type: Boolean, default: false },
  /** Modo criativo: é onde "reger o mundo" existe. */
  criativo: { type: Boolean, default: false },
  /** Numa sala: é onde o chat existe. */
  emRede: { type: Boolean, default: false },
})
const emit = defineEmits([
  'move',
  'break-start',
  'break-end',
  'place-start',
  'place-end',
  'jump',
  'dive',
  'inventory',
  'fly',
  'pause',
  'criativo',
  'chat',
])

const t = useTextos()
const stickEl = ref(null)
const vec = ref({ x: 0, y: 0 })
let touchId = null
let center = { x: 0, y: 0 }

const knobStyle = computed(() => ({
  transform: `translate(${vec.value.x * 28}px, ${vec.value.y * 28}px)`,
}))

function onStart(e) {
  const t0 = e.changedTouches[0]
  touchId = t0.identifier
  const r = stickEl.value.getBoundingClientRect()
  center = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  onMove(e)
}

function onMove(e) {
  for (const t0 of e.changedTouches) {
    if (t0.identifier !== touchId) continue
    const dx = (t0.clientX - center.x) / 44
    const dy = (t0.clientY - center.y) / 44
    const len = Math.hypot(dx, dy)
    const k = len > 1 ? 1 / len : 1
    vec.value = { x: dx * k, y: dy * k }
    emit('move', vec.value)
  }
}

function onEnd() {
  touchId = null
  vec.value = { x: 0, y: 0 }
  emit('move', vec.value)
}
</script>

<style lang="scss" scoped>
.rc-mob {
  // Cores de identidade deste app. Ficam aqui, e não em `tokens-root.scss`,
  // porque são do app e não do sistema — mas ficam como custom property
  // para que um tema consiga alcançá-las.
  --rc-mob-bg-1: rgba(10, 14, 22, 0.3);
  --rc-mob-bg-2: rgba(30, 30, 35, 0.62);
  --rc-mob-bg-3: rgba(52, 96, 40, 0.7);
  --rc-mob-bg-4: rgba(24, 74, 104, 0.62);
  --rc-mob-bg-5: rgba(20, 96, 138, 0.78);
  --rc-mob-bg-6: rgba(30, 30, 35, 0.72);
  --rc-mob-bg-7: rgba(52, 96, 40, 0.78);
}
.rc-mob {
  position: absolute;
  inset: 0;
  pointer-events: none;

  &__stick {
    position: absolute;
    left: calc(var(--ros-space-4, 16px) + env(safe-area-inset-left));
    // 96px levanta o analogico ACIMA da hotbar e da barra de vida. Encostado no
    // rodape (space-8) ele cobria os dois primeiros slots e metade da fome - o
    // jogador nao via o que estava segurando (QA mobile de 2026-08-19).
    bottom: calc(96px + env(safe-area-inset-bottom));
    width: 108px;
    height: 108px;
    border-radius: 50%;
    background: var(--rc-mob-bg-1);
    border: 2px solid var(--ros-line-18, rgba(255, 255, 255, 0.18));
    display: grid;
    place-items: center;
    pointer-events: auto;
    touch-action: none;
  }
  &__knob {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: rgba(var(--ros-white-rgb, 255, 255, 255), 0.28);
    border: 2px solid rgba(var(--ros-white-rgb, 255, 255, 255), 0.42);
    transition: transform 60ms linear;
  }

  &__actions {
    position: absolute;
    right: calc(var(--ros-space-4, 16px) + env(safe-area-inset-right));
    bottom: calc(96px + env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: repeat(2, auto);
    gap: var(--ros-space-2, 8px);
    pointer-events: auto;
  }
  // ⚠️ QUADRADO, NÃO REDONDO — e o analógico ao lado continua redondo de
  // propósito.
  //
  // O botão de ação era um círculo translúcido, que é a convenção de controle
  // de toque genérico e a última peça da interface que ainda parecia de outro
  // jogo. Num mundo feito de cubos, a peça em que se aperta é um cubo. O
  // analógico segue redondo porque ali o formato é FUNÇÃO: ele indica que o
  // dedo pode ir pra qualquer direção, e um quadrado sugeriria quatro.
  &__btn {
    width: 58px;
    height: 58px;
    border-radius: 0;
    border: 2px solid var(--rc-linha);
    background: var(--rc-mob-bg-2);
    box-shadow:
      inset 0 2px 0 var(--rc-luz),
      inset 2px 0 0 var(--rc-luz),
      inset 0 -2px 0 var(--rc-sombra-forte),
      inset -2px 0 0 var(--rc-sombra-forte);
    color: var(--rc-texto);
    display: grid;
    place-items: center;
    cursor: pointer;
    touch-action: none;
    // Afunda ao apertar, igual ao botão de menu: com o dedo cobrindo a peça,
    // a inversão do bisel na borda é o único retorno que dá pra ver.
    &:active {
      background: var(--rc-mob-bg-3);
      box-shadow:
        inset 0 2px 0 var(--rc-sombra-forte),
        inset 2px 0 0 var(--rc-sombra-forte),
        inset 0 -2px 0 var(--rc-luz),
        inset -2px 0 0 var(--rc-luz);
    }
    &--jump {
      grid-column: 2;
      grid-row: 1;
    }
    // A célula (1,1) estava vazia: é o canto do polegar logo acima do quebrar,
    // e o botão que só aparece na água entra ali sem empurrar nenhum outro de
    // lugar. Tinta azulada de propósito — ele some e volta conforme a água, e
    // um botão que pisca precisa ser reconhecível de relance, não decifrado.
    &--dive {
      grid-column: 1;
      grid-row: 1;
      background: var(--rc-mob-bg-4);
      &:active {
        background: var(--rc-mob-bg-5);
      }
    }
    &--break {
      grid-column: 1;
      grid-row: 2;
    }
    &--place {
      grid-column: 2;
      grid-row: 2;
    }
  }

  &__top {
    position: absolute;
    right: calc(var(--ros-space-3, 12px) + env(safe-area-inset-right));
    top: calc(var(--ros-space-3, 12px) + env(safe-area-inset-top));
    display: flex;
    gap: var(--ros-space-2, 8px);
    pointer-events: auto;
  }
  // ⚠️ 44px, não 38. Alvo de toque abaixo de 44 é erro de acessibilidade nas
  // diretrizes da Apple e do Material, e estes três botões — inventário, voo e
  // pausa — ficam no canto superior, que é onde o polegar tem menos precisão.
  &__mini {
    width: var(--rc-toque);
    height: var(--rc-toque);
    border-radius: 0;
    border: 2px solid var(--rc-linha);
    background: var(--rc-mob-bg-6);
    box-shadow:
      inset 0 2px 0 var(--rc-luz),
      inset 0 -2px 0 var(--rc-sombra-forte);
    color: var(--rc-texto);
    display: grid;
    place-items: center;
    cursor: pointer;
    &.is-on {
      background: var(--rc-mob-bg-7);
    }
    &:active {
      box-shadow:
        inset 0 2px 0 var(--rc-sombra-forte),
        inset 0 -2px 0 var(--rc-luz);
    }
  }
}
</style>
