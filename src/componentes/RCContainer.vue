<template>
  <div
    class="rc-cont"
    @click.self="$emit('close')"
    @contextmenu.prevent
    ref="raizDaTela"
    @keydown="aoTeclar"
  >
    <div class="rc-cont__painel" role="dialog" aria-modal="true" :aria-label="titulo">
      <header class="rc-cont__head">
        <h3 class="rc-cont__titulo">{{ titulo }}</h3>
        <button class="rc-cont__x" :aria-label="t('common.close')" @click="$emit('close')">
          <RCIcon nome="fechar" :size="14" />
        </button>
      </header>

      <!-- ── BAÚ: 27 slots em três fileiras de nove ─────────────────────── -->
      <section v-if="tipo === 'bau'" class="rc-cont__caixa rc-cont__bau">
        <button
          v-for="i in 27"
          :key="`b${i}`"
          class="rc-slot"
          :aria-label="rotulo(conteudo[i - 1])"
          @click.left.exact="$emit('container-click', i - 1, 'left')"
          @click.left.shift.exact="$emit('container-click', i - 1, 'shift')"
          @click.right.prevent="$emit('container-click', i - 1, 'right')"
        >
          <img
            v-if="conteudo[i - 1] && icons[conteudo[i - 1].item]"
            :src="icons[conteudo[i - 1].item]"
            :alt="rotulo(conteudo[i - 1])"
          />
          <span v-if="conteudo[i - 1] && conteudo[i - 1].count > 1" class="rc-slot__n">
            {{ conteudo[i - 1].count }}
          </span>
        </button>
      </section>

      <!-- ── SUPORTE DE POÇÕES: ingrediente em cima, três garrafas embaixo ─
           Não há slot de saída: a garrafa se transforma NO LUGAR, e por isso
           também não há combustível (ver `fermentacao.js`). -->
      <section v-else-if="tipo === 'suporte'" class="rc-cont__caixa rc-cont__suporte">
        <!-- ⚠️ O RÓTULO DIZ O PAPEL **E** O CONTEÚDO. Só o papel ("Ingrediente")
             deixa quem usa leitor de tela sem saber o que está lá dentro; só o
             conteúdo não diz que aquele slot é o do ingrediente. Os slots do
             baú usam só o conteúdo porque lá todos os 27 têm o mesmo papel. -->
        <button
          class="rc-slot"
          :aria-label="`${t('roqueCraft.suporte.ingrediente')}: ${rotulo(conteudo[0])}`"
          :title="t('roqueCraft.suporte.ingrediente')"
          @click.left.exact="$emit('container-click', 0, 'left')"
          @click.right.prevent="$emit('container-click', 0, 'right')"
        >
          <img
            v-if="conteudo[0] && icons[conteudo[0].item]"
            :src="icons[conteudo[0].item]"
            :alt="rotulo(conteudo[0])"
          />
          <span v-if="conteudo[0] && conteudo[0].count > 1" class="rc-slot__n">
            {{ conteudo[0].count }}
          </span>
        </button>

        <!-- A bolha desce enquanto fermenta, como no original -->
        <div
          class="rc-cont__bolha"
          role="img"
          :aria-label="t('roqueCraft.suporte.progresso', { pct: Math.round(progresso * 100) })"
        >
          <div
            class="rc-cont__bolha-cheia"
            :style="{ height: `${Math.round(progresso * 100)}%` }"
          />
        </div>

        <div class="rc-cont__garrafas">
          <button
            v-for="i in 3"
            :key="`g${i}`"
            class="rc-slot"
            :aria-label="rotulo(conteudo[i])"
            @click.left.exact="$emit('container-click', i, 'left')"
            @click.right.prevent="$emit('container-click', i, 'right')"
          >
            <img
              v-if="conteudo[i] && icons[conteudo[i].item]"
              :src="icons[conteudo[i].item]"
              :alt="rotulo(conteudo[i])"
            />
          </button>
        </div>
      </section>

      <!-- ── FORNALHA: entrada em cima, combustível embaixo, saída ao lado ─ -->
      <section v-else class="rc-cont__caixa rc-cont__forno">
        <div class="rc-cont__coluna">
          <button
            class="rc-slot"
            :aria-label="t('roqueCraft.forno.entrada')"
            :title="t('roqueCraft.forno.entrada')"
            @click.left.exact="$emit('container-click', 0, 'left')"
            @click.right.prevent="$emit('container-click', 0, 'right')"
          >
            <img
              v-if="conteudo[0] && icons[conteudo[0].item]"
              :src="icons[conteudo[0].item]"
              :alt="rotulo(conteudo[0])"
            />
            <span v-if="conteudo[0] && conteudo[0].count > 1" class="rc-slot__n">
              {{ conteudo[0].count }}
            </span>
          </button>

          <!-- Chama: uma barra que ESVAZIA de baixo pra cima, como no original -->
          <div
            class="rc-cont__fogo"
            role="img"
            :aria-label="t('roqueCraft.forno.fogo', { pct: Math.round(fogo * 100) })"
          >
            <div class="rc-cont__fogo-cheio" :style="{ height: `${Math.round(fogo * 100)}%` }" />
          </div>

          <button
            class="rc-slot"
            :aria-label="t('roqueCraft.forno.combustivel')"
            :title="t('roqueCraft.forno.combustivel')"
            @click.left.exact="$emit('container-click', 1, 'left')"
            @click.right.prevent="$emit('container-click', 1, 'right')"
          >
            <img
              v-if="conteudo[1] && icons[conteudo[1].item]"
              :src="icons[conteudo[1].item]"
              :alt="rotulo(conteudo[1])"
            />
            <span v-if="conteudo[1] && conteudo[1].count > 1" class="rc-slot__n">
              {{ conteudo[1].count }}
            </span>
          </button>
        </div>

        <!-- Seta de progresso: enche da esquerda pra direita -->
        <div
          class="rc-cont__seta"
          role="img"
          :aria-label="t('roqueCraft.forno.progresso', { pct: Math.round(progresso * 100) })"
        >
          <div class="rc-cont__seta-cheia" :style="{ width: `${Math.round(progresso * 100)}%` }" />
        </div>

        <button
          class="rc-slot rc-cont__saida"
          :aria-label="t('roqueCraft.forno.saida')"
          :title="t('roqueCraft.forno.saida')"
          @click.left.exact="$emit('container-click', 2, 'left')"
          @click.right.prevent="$emit('container-click', 2, 'right')"
        >
          <img
            v-if="conteudo[2] && icons[conteudo[2].item]"
            :src="icons[conteudo[2].item]"
            :alt="rotulo(conteudo[2])"
          />
          <span v-if="conteudo[2] && conteudo[2].count > 1" class="rc-slot__n">
            {{ conteudo[2].count }}
          </span>
        </button>
      </section>

      <!-- ── O inventário do jogador, igual ao da tela de inventário ─────── -->
      <section class="rc-cont__caixa rc-cont__bau">
        <button
          v-for="i in 27"
          :key="`m${i}`"
          class="rc-slot"
          :aria-label="rotulo(slots[i + 8])"
          @click.left.exact="$emit('slot-click', i + 8, 'left')"
          @click.left.shift.exact="$emit('slot-click', i + 8, 'shift')"
          @click.right.prevent="$emit('slot-click', i + 8, 'right')"
        >
          <img
            v-if="slots[i + 8] && icons[slots[i + 8].item]"
            :src="icons[slots[i + 8].item]"
            :alt="rotulo(slots[i + 8])"
          />
          <span v-if="slots[i + 8] && slots[i + 8].count > 1" class="rc-slot__n">
            {{ slots[i + 8].count }}
          </span>
        </button>
      </section>

      <section class="rc-cont__caixa rc-cont__hotbar">
        <button
          v-for="i in 9"
          :key="`h${i}`"
          class="rc-slot"
          :aria-label="rotulo(slots[i - 1])"
          @click.left.exact="$emit('slot-click', i - 1, 'left')"
          @click.left.shift.exact="$emit('slot-click', i - 1, 'shift')"
          @click.right.prevent="$emit('slot-click', i - 1, 'right')"
        >
          <img
            v-if="slots[i - 1] && icons[slots[i - 1].item]"
            :src="icons[slots[i - 1].item]"
            :alt="rotulo(slots[i - 1])"
          />
          <span v-if="slots[i - 1] && slots[i - 1].count > 1" class="rc-slot__n">
            {{ slots[i - 1].count }}
          </span>
        </button>
      </section>
    </div>

    <div
      v-if="cursor"
      class="rc-cont__cursor"
      :style="{ left: `${mouse.x}px`, top: `${mouse.y}px` }"
      aria-hidden="true"
    >
      <img v-if="icons[cursor.item]" :src="icons[cursor.item]" :alt="''" />
      <span v-if="cursor.count > 1">{{ cursor.count }}</span>
    </div>
  </div>
</template>

<script setup>
// Tela do BAÚ e da FORNALHA.
//
// Separado de `RCInventory.vue` de propósito: aquele componente é sobre CRAFT
// (grade, resultado, livro de receitas) e já tem 434 linhas. Empurrar dois
// modos novos pra dentro dele era exatamente o "código gigante" que o founder
// pediu pra evitar. O que os dois compartilham — o slot — virou `.rc-slot` no
// SCSS global, então a aparência tem um dono só.
import RCIcon from './RCIcon.vue'
import { ref, computed } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { useFocoDeTela } from '../composables/useFocoDeTela.js'
import { nomeDaPilha } from '../servicos/rotulo.js'

const props = defineProps({
  tipo: { type: String, required: true }, // 'bau' | 'fornalha' | 'suporte'
  conteudo: { type: Array, required: true },
  slots: { type: Array, required: true },
  fogo: { type: Number, default: 0 },
  progresso: { type: Number, default: 0 },
  cursor: { type: Object, default: null },
  mouse: { type: Object, default: () => ({ x: 0, y: 0 }) },
  icons: { type: Object, default: () => ({}) },
})

defineEmits(['close', 'container-click', 'slot-click'])

const t = useTextos()

// A MALHA DE FOCO. Abrir foca o primeiro controle, Tab e setas circulam sem
// escapar para trás do véu, e fechar devolve o foco a quem abriu. Ver
// `useFocoDeTela` — e `focoDeTela.js` para a regra pura.
const raizDaTela = ref(null)
const { aoTeclar } = useFocoDeTela(raizDaTela)
const TITULO = { bau: 'roqueCraft.bau.titulo', suporte: 'roqueCraft.suporte.titulo' }
const titulo = computed(() => t(TITULO[props.tipo] || 'roqueCraft.forno.titulo'))
const rotulo = (slot) =>
  slot ? `${nomeDaPilha(slot, t)} ×${slot.count}` : t('roqueCraft.inv.empty')
</script>

<style lang="scss" scoped>
.rc-cont {
  // Cores de identidade deste app. Ficam aqui, e não em `tokens-root.scss`,
  // porque são do app e não do sistema — mas ficam como custom property
  // para que um tema consiga alcançá-las.
  --rc-cont-bg-1: rgba(8, 9, 12, 0.72);
  --rc-cont-shadow-1: rgba(0, 0, 0, 0.62);
  --rc-cont-bg-2: #ffb03a;
  --rc-cont-bg-3: #ff6a17;
  // A bolha do suporte: azul, contra o laranja da chama da fornalha. As duas
  // barras vivem lado a lado no mesmo painel, e cor igual faria "fermentando"
  // e "queimando" parecerem a mesma coisa.
  --rc-bolha-topo: #7cc6ff;
  --rc-bolha-base: #2f7fd6;
}
.rc-cont {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: var(--rc-cont-bg-1);
  pointer-events: auto;

  &__painel {
    width: min(560px, 94%);
    max-height: 92%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--ros-space-3, 12px);
    padding: var(--ros-space-4, 16px);
    border-radius: var(--rc-raio);
    background: var(--rc-painel);
    border: 2px solid var(--rc-linha);
    box-shadow:
      inset 0 2px 0 var(--rc-luz),
      inset 2px 0 0 var(--rc-luz),
      inset 0 -2px 0 var(--rc-sombra-forte),
      inset -2px 0 0 var(--rc-sombra-forte),
      0 14px 36px var(--rc-cont-shadow-1);
    color: var(--rc-texto);
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__titulo {
    margin: 0;
    font-size: var(--ros-text-lg, 16px);
    font-weight: var(--ros-font-semibold, 600);
  }
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
    &:hover {
      color: var(--rc-texto);
    }
    &:focus-visible {
      outline: 2px solid var(--rc-grama);
      outline-offset: -4px;
    }
  }

  // A caixa é o RECUO da placa: os slots ficam dentro de um rebaixo, não soltos
  // sobre o painel.
  &__caixa {
    padding: var(--ros-space-2, 8px);
    background: var(--rc-fundo);
    border: 1px solid var(--rc-linha);
    box-shadow: inset 0 1px 0 var(--rc-sombra-forte);
  }
  &__bau {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 4px;
  }
  &__hotbar {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 4px;
  }
  &__forno {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ros-space-4, 16px);
  }
  &__coluna {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  &__saida {
    width: 54px;
    height: 54px;
    img {
      width: 40px;
      height: 40px;
    }
  }

  // Chama e seta: barras chatas, sem gradiente. O mundo é de bloco; medidor com
  // brilho suave lê como painel de aplicativo.
  &__suporte {
    display: grid;
    grid-template-columns: auto 18px 1fr;
    align-items: center;
    gap: 10px;
  }

  &__garrafas {
    display: flex;
    gap: 8px;
  }

  // A bolha ENCHE de baixo pra cima; a chama da fornalha ESVAZIA. São gestos
  // opostos de propósito: uma conta o que sobra, a outra o que já andou.
  &__bolha {
    position: relative;
    width: 12px;
    height: 46px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--rc-recuo);
    border: 1px solid var(--rc-linha);
  }

  &__bolha-cheia {
    position: absolute;
    inset: auto 0 0 0;
    background: linear-gradient(180deg, var(--rc-bolha-topo), var(--rc-bolha-base));
  }

  &__fogo {
    position: relative;
    width: 16px;
    height: 20px;
    background: var(--rc-recuo);
    border: 1px solid var(--rc-linha);
    overflow: hidden;
  }
  &__fogo-cheio {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    background: linear-gradient(180deg, var(--rc-cont-bg-2) 0%, var(--rc-cont-bg-3) 100%);
  }
  &__seta {
    position: relative;
    width: 72px;
    height: 12px;
    background: var(--rc-recuo);
    border: 1px solid var(--rc-linha);
    overflow: hidden;
  }
  &__seta-cheia {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--rc-pedra);
  }

  &__cursor {
    position: fixed;
    z-index: 30;
    width: 34px;
    height: 34px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    img {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }
    span {
      position: absolute;
      right: 0;
      bottom: -2px;
      font-size: 11px;
      font-weight: 700;
      color: var(--ros-text-100, rgb(255, 255, 255));
      text-shadow: 1px 1px 0 rgb(var(--ros-black-rgb, 0, 0, 0));
    }
  }
}
</style>
