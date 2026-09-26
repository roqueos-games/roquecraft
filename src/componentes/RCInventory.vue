<template>
  <div
    class="rc-inv"
    @click.self="$emit('close')"
    @contextmenu.prevent
    ref="raizDaTela"
    @keydown="aoTeclar"
  >
    <div
      class="rc-inv__panel ros-scrollbar-dark"
      role="dialog"
      aria-modal="true"
      :aria-label="t('roqueCraft.inv.title')"
    >
      <header class="rc-inv__head">
        <h3 class="rc-inv__title">
          {{ hasTable ? t('roqueCraft.inv.crafting') : t('roqueCraft.inv.title') }}
        </h3>
        <button class="rc-inv__x" :aria-label="t('common.close')" @click="$emit('close')">
          <RCIcon nome="fechar" :size="14" />
        </button>
      </header>

      <!-- Grade de crafting + resultado -->
      <section class="rc-inv__craft">
        <div class="rc-inv__grid" :class="`rc-inv__grid--${gridSize}`">
          <button
            v-for="(slot, i) in craft"
            :key="`c${i}`"
            class="rc-inv__slot"
            :aria-label="slotLabel(slot)"
            @click.left="$emit('craft-click', i, 'left')"
            @click.right.prevent="$emit('craft-click', i, 'right')"
          >
            <img v-if="slot && icons[slot.item]" :src="icons[slot.item]" :alt="slotLabel(slot)" />
            <span v-if="slot && slot.count > 1" class="rc-inv__count">{{ slot.count }}</span>
          </button>
        </div>

        <RCIcon class="rc-inv__arrow" nome="seta" :size="22" />

        <button
          class="rc-inv__slot rc-inv__slot--result"
          :class="{ 'is-empty': !result }"
          :aria-label="result ? slotLabel(result) : t('roqueCraft.inv.noRecipe')"
          @click="$emit('take-result')"
        >
          <img
            v-if="result && icons[result.item]"
            :src="icons[result.item]"
            :alt="slotLabel(result)"
          />
          <span v-if="result && result.count > 1" class="rc-inv__count">{{ result.count }}</span>
        </button>
      </section>

      <p v-if="!hasTable" class="rc-inv__hint">{{ t('roqueCraft.inv.tableHint') }}</p>

      <!-- A armadura: quatro lugares, de cima para baixo. Clique com o cursor
           vazio pega a peça; clique com uma peça no cursor veste — o mesmo
           gesto de pegar-e-pôr dos outros slots, que existe também no toque.
           Shift+clique numa peça da mochila veste direto (atalho do teclado). -->
      <section v-if="armadura" class="rc-inv__armadura" :aria-label="t('roqueCraft.inv.armor')">
        <button
          v-for="peca in PECAS"
          :key="peca"
          class="rc-inv__slot rc-inv__slot--armadura"
          :class="{ 'is-empty': !armadura[peca] }"
          :data-test="`rc-inv-${peca}`"
          :aria-label="
            armadura[peca]
              ? slotLabel({ ...armadura[peca], count: 1 })
              : t(`roqueCraft.inv.${peca}`)
          "
          @click.left.exact="$emit('slot-click', peca, 'left')"
        >
          <img
            v-if="armadura[peca] && icons[armadura[peca].item]"
            :src="icons[armadura[peca].item]"
            :alt="slotLabel({ ...armadura[peca], count: 1 })"
          />
          <RCIcon v-else class="rc-inv__vazio" :nome="ICONE_DA_PECA[peca]" :size="18" />
        </button>
        <span class="rc-inv__pontos" :aria-label="t('roqueCraft.hud.armor')">
          {{ pontosDe(armadura) }}
        </span>
      </section>

      <!-- Mochila -->
      <section class="rc-inv__bag">
        <div class="rc-inv__row">
          <button
            v-for="i in 27"
            :key="`m${i}`"
            class="rc-inv__slot"
            :aria-label="slotLabel(slots[i + 8])"
            @click.left.exact="$emit('slot-click', i + 8, 'left')"
            @click.left.shift.exact="$emit('slot-click', i + 8, 'shift')"
            @click.right.prevent="$emit('slot-click', i + 8, 'right')"
          >
            <img
              v-if="slots[i + 8] && icons[slots[i + 8].item]"
              :src="icons[slots[i + 8].item]"
              :alt="slotLabel(slots[i + 8])"
            />
            <span v-if="slots[i + 8] && slots[i + 8].count > 1" class="rc-inv__count">
              {{ slots[i + 8].count }}
            </span>
          </button>
        </div>
      </section>

      <!-- Hotbar -->
      <section class="rc-inv__bag rc-inv__bag--hot">
        <div class="rc-inv__row rc-inv__row--hot">
          <button
            v-for="i in 9"
            :key="`h${i}`"
            class="rc-inv__slot"
            :aria-label="slotLabel(slots[i - 1])"
            @click.left.exact="$emit('slot-click', i - 1, 'left')"
            @click.left.shift.exact="$emit('slot-click', i - 1, 'shift')"
            @click.right.prevent="$emit('slot-click', i - 1, 'right')"
          >
            <img
              v-if="slots[i - 1] && icons[slots[i - 1].item]"
              :src="icons[slots[i - 1].item]"
              :alt="slotLabel(slots[i - 1])"
            />
            <span v-if="slots[i - 1] && slots[i - 1].count > 1" class="rc-inv__count">
              {{ slots[i - 1].count }}
            </span>
          </button>
        </div>
      </section>

      <!-- Livro de receitas: o que dá pra fazer AGORA com o que se tem -->
      <section v-if="craftable.length" class="rc-inv__book">
        <h4 class="rc-inv__book-title">{{ t('roqueCraft.inv.canCraft') }}</h4>
        <div class="rc-inv__book-row">
          <button
            v-for="r in craftable"
            :key="r.result"
            class="rc-inv__slot rc-inv__slot--recipe"
            :title="itemLabel(r.result)"
            :aria-label="itemLabel(r.result)"
            @click="$emit('auto-craft', r)"
          >
            <img v-if="icons[r.result]" :src="icons[r.result]" :alt="itemLabel(r.result)" />
            <span v-if="r.count > 1" class="rc-inv__count">{{ r.count }}</span>
          </button>
        </div>
      </section>

      <!-- Criativo: catálogo completo de blocos -->
      <section v-if="creative" class="rc-inv__book">
        <h4 class="rc-inv__book-title">{{ t('roqueCraft.inv.allBlocks') }}</h4>
        <div class="rc-inv__book-row rc-inv__book-row--wrap">
          <button
            v-for="key in allBlocks"
            :key="key"
            class="rc-inv__slot rc-inv__slot--recipe"
            :title="itemLabel(key)"
            :aria-label="itemLabel(key)"
            @click="$emit('give', key)"
          >
            <img v-if="icons[key]" :src="icons[key]" :alt="itemLabel(key)" />
          </button>
        </div>
      </section>
    </div>

    <!-- Pilha "na mão" segue o cursor -->
    <div
      v-if="cursor"
      class="rc-inv__cursor"
      :style="{ left: `${mouse.x}px`, top: `${mouse.y}px` }"
      aria-hidden="true"
    >
      <img v-if="icons[cursor.item]" :src="icons[cursor.item]" :alt="''" />
      <span v-if="cursor.count > 1">{{ cursor.count }}</span>
    </div>
  </div>
</template>

<script setup>
import RCIcon from './RCIcon.vue'
import { ref } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { useFocoDeTela } from '../composables/useFocoDeTela.js'
import { nomeDoItem, nomeDaPilha } from '../servicos/rotulo.js'
import { PECAS, pontosDe } from '../servicos/armadura.js'

// O desenho do lugar vazio: diz qual peça vai ali antes de haver peça.
const ICONE_DA_PECA = {
  helmet: 'capacete',
  chestplate: 'peitoral',
  leggings: 'calca',
  boots: 'bota',
}

defineProps({
  slots: { type: Array, required: true },
  craft: { type: Array, required: true },
  gridSize: { type: Number, default: 2 },
  hasTable: { type: Boolean, default: false },
  result: { type: Object, default: null },
  cursor: { type: Object, default: null },
  mouse: { type: Object, default: () => ({ x: 0, y: 0 }) },
  icons: { type: Object, default: () => ({}) },
  craftable: { type: Array, default: () => [] },
  creative: { type: Boolean, default: false },
  allBlocks: { type: Array, default: () => [] },
  armadura: { type: Object, default: null },
})

defineEmits(['close', 'slot-click', 'craft-click', 'take-result', 'auto-craft', 'give'])

const t = useTextos()

// A MALHA DE FOCO. Abrir foca o primeiro controle, Tab e setas circulam sem
// escapar para trás do véu, e fechar devolve o foco a quem abriu. Ver
// `useFocoDeTela` — e `focoDeTela.js` para a regra pura.
const raizDaTela = ref(null)
const { aoTeclar } = useFocoDeTela(raizDaTela)
const itemLabel = (key) => nomeDoItem(key, t)
const slotLabel = (slot) =>
  slot ? `${nomeDaPilha(slot, t)} ×${slot.count}` : t('roqueCraft.inv.empty')
</script>

<style lang="scss" scoped>
.rc-inv {
  // Cores de identidade deste app. Ficam aqui, e não em `tokens-root.scss`,
  // porque são do app e não do sistema — mas ficam como custom property
  // para que um tema consiga alcançá-las.
  --rc-inv-bg-1: rgba(8, 9, 12, 0.72);
  --rc-inv-shadow-1: rgba(0, 0, 0, 0.62);
  --rc-inv-bg-2: #22222a;
  --rc-inv-bg-3: rgba(52, 96, 40, 0.55);
  --rc-inv-bg-4: #1d1d23;
}
.rc-inv {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: var(--rc-inv-bg-1);
  pointer-events: auto;

  &__panel {
    width: min(560px, 94%);
    max-height: 92%;
    overflow-y: auto;
    padding: var(--ros-space-4, 16px);
    border-radius: var(--rc-raio);
    background: var(--rc-painel);
    border: 2px solid var(--rc-linha);
    box-shadow:
      inset 0 2px 0 var(--rc-luz),
      inset 2px 0 0 var(--rc-luz),
      inset 0 -2px 0 var(--rc-sombra-forte),
      inset -2px 0 0 var(--rc-sombra-forte),
      0 14px 36px var(--rc-inv-shadow-1);
    color: var(--rc-texto);
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--ros-space-3, 12px);
  }
  &__title {
    display: flex;
    align-items: center;
    gap: var(--ros-space-2, 8px);
    margin: 0;
    font-size: var(--ros-text-lg, 16px);
    font-weight: var(--ros-font-semibold, 600);
  }
  // 44px de alvo mesmo com o ícone de 14: fechar é a ação que mais se erra no
  // celular, e alvo pequeno num canto é o pior caso possível.
  &__x {
    display: grid;
    place-items: center;
    width: var(--rc-toque);
    height: var(--rc-toque);
    margin: calc(var(--ros-space-2, 8px) * -1);
    background: none;
    border: 0;
    color: var(--rc-texto-2);
    cursor: pointer;
    border-radius: 0;
    &:hover {
      color: var(--rc-texto);
    }
    &:focus-visible {
      outline: 2px solid var(--rc-grama);
      outline-offset: -4px;
    }
  }

  &__craft {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ros-space-3, 12px);
    padding: var(--ros-space-3, 12px);
    border-radius: 0;
    background: var(--rc-fundo);
    border: 1px solid var(--rc-linha);
    box-shadow: inset 0 1px 0 var(--rc-sombra-forte);
  }
  &__grid {
    display: grid;
    gap: 4px;
    &--2 {
      grid-template-columns: repeat(2, 1fr);
    }
    &--3 {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  &__arrow {
    color: var(--rc-texto-3);
  }

  &__slot {
    position: relative;
    width: 44px;
    height: 44px;
    // Mesma gramática do slot da hotbar: buraco, com a luz embaixo.
    border: 2px solid var(--rc-linha);
    border-radius: 0;
    background: var(--rc-recuo);
    box-shadow:
      inset 0 2px 0 var(--rc-sombra-forte),
      inset 2px 0 0 var(--rc-sombra-forte),
      inset 0 -2px 0 var(--rc-luz),
      inset -2px 0 0 var(--rc-luz);
    cursor: pointer;
    padding: 0;
    display: grid;
    place-items: center;
    transition: background-color var(--ros-duration-fast, 150ms);

    &:hover {
      background: var(--rc-inv-bg-2);
    }
    &:focus-visible {
      outline: 2px solid var(--rc-grama);
      outline-offset: 1px;
    }
    img {
      width: 32px;
      height: 32px;
      image-rendering: pixelated;
      pointer-events: none;
    }
    &--result {
      width: 54px;
      height: 54px;
      background: var(--rc-inv-bg-3);
      // Bisel invertido: o resultado SAI da bancada, não é mais um buraco.
      box-shadow:
        inset 0 2px 0 var(--rc-luz-forte),
        inset 2px 0 0 var(--rc-luz-forte),
        inset 0 -2px 0 var(--rc-sombra-forte),
        inset -2px 0 0 var(--rc-sombra-forte);
      &.is-empty {
        background: var(--rc-recuo);
        box-shadow:
          inset 0 2px 0 var(--rc-sombra-forte),
          inset 2px 0 0 var(--rc-sombra-forte),
          inset 0 -2px 0 var(--rc-luz),
          inset -2px 0 0 var(--rc-luz);
        cursor: default;
      }
      img {
        width: 40px;
        height: 40px;
      }
    }
    &--recipe {
      width: 38px;
      height: 38px;
      img {
        width: 28px;
        height: 28px;
      }
    }
  }

  &__count {
    position: absolute;
    right: 2px;
    bottom: 0;
    font-size: var(--ros-text-sm, 12px);
    font-weight: var(--ros-font-bold, 700);
    text-shadow: 0 1px 2px rgb(var(--ros-black-rgb, 0, 0, 0));
    pointer-events: none;
  }

  &__hint {
    margin: var(--ros-space-2, 8px) 0 0;
    text-align: center;
    font-size: var(--ros-text-sm, 12px);
    color: var(--rc-texto-2);
  }

  &__armadura {
    // As mesmas nove colunas da mochila: os quatro lugares ficam do tamanho
    // dos outros slots, alinhados à esquerda, e o total logo ao lado.
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 4px;
    align-items: center;
    margin-top: var(--ros-space-3, 12px);
  }
  &__vazio {
    opacity: 0.5;
  }
  &__pontos {
    grid-column: 5 / span 2;
    padding: 0 var(--ros-space-2, 8px);
    font-size: var(--ros-text-sm, 12px);
    color: var(--rc-texto-2);
    font-variant-numeric: tabular-nums;
  }
  &__bag {
    margin-top: var(--ros-space-3, 12px);
    &--hot {
      margin-top: var(--ros-space-2, 8px);
      padding-top: var(--ros-space-2, 8px);
      border-top: 1px solid var(--rc-linha);
      box-shadow: inset 0 1px 0 var(--rc-luz);
    }
  }
  &__row {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 4px;
    &--hot .rc-inv__slot {
      background: var(--rc-inv-bg-4);
    }
  }

  &__book {
    margin-top: var(--ros-space-4, 16px);
  }
  &__book-title {
    margin: 0 0 var(--ros-space-2, 8px);
    font-size: var(--ros-text-sm, 12px);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.6;
  }
  &__book-row {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 4px;
    &--wrap {
      flex-wrap: wrap;
      overflow-x: visible;
      max-height: 190px;
      overflow-y: auto;
    }
  }

  &__cursor {
    position: fixed;
    z-index: 40;
    pointer-events: none;
    transform: translate(-50%, -50%);
    img {
      width: 34px;
      height: 34px;
      image-rendering: pixelated;
      filter: drop-shadow(0 3px 6px var(--ros-shadow-60, rgba(0, 0, 0, 0.6)));
    }
    span {
      position: absolute;
      right: -4px;
      bottom: -4px;
      font-size: var(--ros-text-sm, 12px);
      font-weight: var(--ros-font-bold, 700);
      color: var(--ros-text-100, rgb(255, 255, 255));
      text-shadow: 0 1px 3px rgb(var(--ros-black-rgb, 0, 0, 0));
    }
  }
}

@media (max-width: 600px) {
  .rc-inv__panel {
    padding: var(--ros-space-3, 12px);
    padding-bottom: calc(var(--ros-space-3, 12px) + env(safe-area-inset-bottom));
  }
  .rc-inv__slot {
    width: 34px;
    height: 34px;
    img {
      width: 25px;
      height: 25px;
    }
  }
  .rc-inv__slot--result {
    width: 44px;
    height: 44px;
    img {
      width: 32px;
      height: 32px;
    }
  }
}
</style>
