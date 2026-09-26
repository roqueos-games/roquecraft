<template>
  <div class="rc-start" ref="raizDaTela" @keydown="aoTeclar">
    <div class="rc-start__scrim" />

    <div class="rc-start__brand">
      <img class="rc-start__mark" :src="ICON" alt="" draggable="false" />
      <h1 class="rc-start__logo"><span>Roque</span><span class="rc-start__logo-b">Craft</span></h1>
      <p class="rc-start__tag">{{ t('roqueCraft.menu.tagline') }}</p>
    </div>

    <nav class="rc-start__menu">
      <button
        v-if="hasSave"
        class="rc-btn rc-start__btn rc-start__btn--primary"
        data-test="rc-continue"
        @click="$emit('continue')"
      >
        <RCIcon nome="play" :size="20" />
        <span class="rc-start__btn-txt">
          <strong>{{ t('roqueCraft.menu.continue') }}</strong>
          <small v-if="saveLabel">{{ saveLabel }}</small>
        </span>
      </button>

      <button
        class="rc-btn rc-start__btn"
        :class="{ 'rc-start__btn--primary': !hasSave }"
        data-test="rc-new"
        @click="$emit('new-world')"
      >
        <RCIcon nome="globo" :size="20" />
        <span class="rc-start__btn-txt">
          <strong>{{ t('roqueCraft.menu.newWorld') }}</strong>
          <small>{{ t('roqueCraft.menu.newWorldHint') }}</small>
        </span>
      </button>

      <button class="rc-btn rc-start__btn" data-test="rc-friends" @click="$emit('friends')">
        <RCIcon nome="gente" :size="20" />
        <span class="rc-start__btn-txt">
          <strong>{{ t('roqueCraft.menu.friends') }}</strong>
          <small>{{ t('roqueCraft.menu.friendsHint') }}</small>
        </span>
      </button>

      <button class="rc-btn rc-start__btn" data-test="rc-settings" @click="$emit('settings')">
        <span class="rc-start__btn-txt">
          <strong>{{ t('roqueCraft.menu.settings') }}</strong>
        </span>
      </button>
    </nav>

    <footer class="rc-start__foot">
      <span>{{ seedLine }}</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { useFocoDeTela } from '../composables/useFocoDeTela.js'
import RCIcon from './RCIcon.vue'

const props = defineProps({
  hasSave: { type: Boolean, default: false },
  seed: { type: [Number, String], default: 0 },
  mode: { type: String, default: 'survival' },
  day: { type: Number, default: 1 },
})
defineEmits(['continue', 'new-world', 'friends', 'settings'])

const t = useTextos()

// A MALHA DE FOCO. Abrir foca o primeiro controle, Tab e setas circulam sem
// escapar para trás do véu, e fechar devolve o foco a quem abriu. Ver
// `useFocoDeTela` — e `focoDeTela.js` para a regra pura.
const raizDaTela = ref(null)
const { aoTeclar } = useFocoDeTela(raizDaTela)

// Caminho em runtime (não `src="..."`): assim o ícone continua sendo UM arquivo
// servido de /public, o mesmo que `apps.js` aponta - e não uma cópia embutida
// em data-uri dentro do chunk.
const ICON = '/games/roquecraft/icon.svg'

// Linha de contexto do save: sem ela, "Continuar" é um botão cego - o jogador
// não sabe se vai cair no mundo criativo de ontem ou na sobrevivência de agora.
// Objeto literal como 2º argumento DENTRO do template não chegou a chamar o
// `t` do setup no ambiente de teste (o compilador resolveu por outro caminho).
// Computar no script é o padrão do arquivo e é testável de verdade.
const seedLine = computed(() => t('roqueCraft.menu.seed', { seed: props.seed }))

const saveLabel = computed(() => {
  const m = t(`roqueCraft.menu.mode.${props.mode === 'creative' ? 'creative' : 'survival'}`)
  return t('roqueCraft.menu.saveLine', { mode: m, day: props.day })
})
</script>

<style lang="scss" scoped>
.rc-start {
  // Cores de identidade deste app. Ficam aqui, e não em `tokens-root.scss`,
  // porque são do app e não do sistema — mas ficam como custom property
  // para que um tema consiga alcançá-las.
  --rc-start-bg-1: rgba(6, 12, 20, 0.86);
  --rc-start-bg-2: rgba(6, 12, 20, 0.72);
  --rc-start-bg-3: rgba(6, 12, 20, 0.28);
  --rc-start-bg-4: rgba(6, 12, 20, 0.1);
  --rc-start-shadow-1: rgba(0, 0, 0, 0.45);
  --rc-start-shadow-2: rgba(0, 0, 0, 0.3);
  --rc-start-shadow-3: rgba(0, 0, 0, 0.55);
  --rc-start-bg-5: rgba(38, 38, 43, 0.92);
  --rc-start-bg-6: rgba(58, 58, 69, 0.95);
  --rc-start-fg-1: rgba(14, 36, 8, 0.72);
  --rc-start-bg-7: rgba(6, 12, 20, 0.2);
  --rc-start-bg-8: rgba(6, 12, 20, 0.55);
  --rc-start-bg-9: rgba(6, 12, 20, 0.9);
}
.rc-start {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: calc(var(--ros-space-8, 32px) + env(safe-area-inset-top))
    calc(var(--ros-space-8, 32px) + env(safe-area-inset-left))
    calc(var(--ros-space-8, 32px) + env(safe-area-inset-bottom))
    calc(var(--ros-space-8, 32px) + env(safe-area-inset-right));
  color: var(--ros-text-100, rgb(255, 255, 255));
  user-select: none;

  // Scrim só do lado do texto: o mundo continua visível à direita, girando.
  // Um véu escuro por cima de tudo mataria o motivo de a câmera estar orbitando.
  &__scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      var(--rc-start-bg-1) 0%,
      var(--rc-start-bg-2) 34%,
      var(--rc-start-bg-3) 62%,
      var(--rc-start-bg-4) 100%
    );
    pointer-events: none;
  }

  &__brand {
    position: relative;
    margin-bottom: var(--ros-space-7, 28px);
  }

  &__mark {
    width: 64px;
    height: 64px;
    display: block;
    margin-bottom: var(--ros-space-3, 12px);
    filter: drop-shadow(0 6px 14px var(--ros-shadow-50, rgba(0, 0, 0, 0.5)));
  }

  &__logo {
    margin: 0;
    font-size: clamp(2.4rem, 6.4vw, 4.2rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 0.95;
    // Relevo "escavado": três sombras deslocadas fazem o texto parecer talhado
    // no bloco, sem depender de nenhuma fonte especial.
    text-shadow:
      0 2px 0 var(--rc-start-shadow-1),
      0 4px 0 var(--rc-start-shadow-2),
      0 10px 28px var(--rc-start-shadow-3);

    span {
      color: var(--rc-texto);
    }
    // O verde do wordmark passa a ser o MESMO da grama de floresta que o mundo
    // atrás está desenhando. Antes era um verde escolhido no olho, e a diferença
    // entre os dois aparecia justamente no print do menu, com a mata ao lado.
    .rc-start__logo-b {
      color: var(--rc-grama);
    }
  }

  &__tag {
    margin: var(--ros-space-2, 8px) 0 0;
    font-size: var(--ros-text-md, 14px);
    color: var(--ros-text-72, rgba(255, 255, 255, 0.72));
    max-width: 34ch;
    text-shadow: 0 1px 6px var(--ros-shadow-60, rgba(0, 0, 0, 0.6));
  }

  &__menu {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--ros-space-2, 8px);
    max-width: 380px;
  }

  // O bisel, a altura mínima e o afundar-ao-apertar vêm do primitivo `.rc-btn`
  // (css/roquecraft.scss). Aqui fica só o que é do menu inicial.
  //
  // ⚠️ O `backdrop-filter: blur(10px)` saiu. Era o que mais fazia esta tela
  // parecer iOS: vidro fosco é a linguagem de um sistema operacional, não a de
  // um mundo de blocos. No lugar entrou opacidade alta com bisel — a peça fica
  // opaca como uma placa apoiada na tela, que é o que ela deveria ser.
  &__btn {
    background: var(--rc-start-bg-5);

    &:hover:not(:disabled) {
      background: var(--rc-start-bg-6);
    }

    // Sem `translateX` no hover: o menu inteiro andando de lado a cada passada
    // de mouse é movimento sem informação. O que muda é a cor, e ao APERTAR a
    // peça afunda — que é retorno de verdade.
    &--primary {
      background: var(--rc-acao);
      color: var(--rc-acao-texto);

      &:hover:not(:disabled) {
        background: var(--rc-grama);
      }

      .rc-start__btn-txt small {
        color: var(--rc-start-fg-1);
      }
    }
  }

  &__btn-txt {
    display: flex;
    flex-direction: column;
    line-height: 1.25;

    strong {
      font-size: var(--ros-text-md, 14px);
      font-weight: var(--ros-font-semibold, 600);
    }
    small {
      font-size: var(--ros-text-xs, 10px);
      color: var(--rc-texto-2);
    }
  }

  &__foot {
    position: relative;
    margin-top: var(--ros-space-6, 24px);
    font-size: var(--ros-text-xs, 10px);
    color: rgba(var(--ros-white-rgb, 255, 255, 255), 0.42);
    font-variant-numeric: tabular-nums;
  }
}

// No retrato o mundo fica ATRÁS do texto, então o scrim precisa fechar por
// cima - senão o botão some sobre o céu claro.
@media (max-width: 720px) {
  .rc-start {
    justify-content: flex-end;
    // a linha da semente encostava na borda inferior no retrato
    padding-bottom: calc(var(--ros-space-6, 24px) + env(safe-area-inset-bottom));

    &__scrim {
      background: linear-gradient(
        180deg,
        var(--rc-start-bg-7) 0%,
        var(--rc-start-bg-8) 42%,
        var(--rc-start-bg-9) 100%
      );
    }
    &__menu {
      max-width: none;
    }
    &__foot {
      margin-top: var(--ros-space-4, 16px);
    }
    &__mark {
      width: 52px;
      height: 52px;
    }
  }
}
</style>
