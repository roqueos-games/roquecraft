<template>
  <div class="rc-pause" :class="{ 'rc-pause--death': dead }" ref="raizDaTela" @keydown="aoTeclar">
    <div
      class="rc-pause__panel ros-scrollbar-dark"
      role="dialog"
      aria-modal="true"
      :aria-label="t('roqueCraft.title')"
    >
      <template v-if="dead">
        <h2 class="rc-pause__title rc-pause__title--death">{{ t('roqueCraft.death.title') }}</h2>
        <p class="rc-pause__sub">{{ deathReason }}</p>
        <button class="rc-btn rc-pause__btn rc-pause__btn--primary" @click="$emit('respawn')">
          {{ t('roqueCraft.death.respawn') }}
        </button>
      </template>

      <template v-else-if="tab === 'menu'">
        <h2 class="rc-pause__title">{{ t('roqueCraft.title') }}</h2>
        <button class="rc-btn rc-pause__btn rc-pause__btn--primary" @click="$emit('resume')">
          {{ t('roqueCraft.pause.resume') }}
        </button>
        <button class="rc-btn rc-pause__btn" @click="tab = 'settings'">
          {{ t('roqueCraft.pause.settings') }}
        </button>
        <button class="rc-btn rc-pause__btn" @click="$emit('lobby')">
          {{ mpActive ? t('roqueCraft.mp.online') : t('roqueCraft.mp.multiplayer') }}
        </button>
        <button class="rc-btn rc-pause__btn" @click="tab = 'controls'">
          {{ t('roqueCraft.pause.controls') }}
        </button>
        <button class="rc-btn rc-pause__btn" @click="tab = 'credits'">
          {{ t('roqueCraft.pause.credits') }}
        </button>
        <div class="rc-pause__mode">
          <span>{{ t('roqueCraft.pause.mode') }}</span>
          <div class="rc-pause__seg">
            <button
              :class="{ 'is-on': mode === 'survival' }"
              @click="$emit('set-mode', 'survival')"
            >
              {{ t('roqueCraft.pause.survival') }}
            </button>
            <button
              :class="{ 'is-on': mode === 'creative' }"
              @click="$emit('set-mode', 'creative')"
            >
              {{ t('roqueCraft.pause.creative') }}
            </button>
          </div>
        </div>
        <p class="rc-pause__seed">
          {{ t('roqueCraft.pause.seed') }}: <strong>{{ seed }}</strong>
        </p>
      </template>

      <template v-else-if="tab === 'settings'">
        <h2 class="rc-pause__title">{{ t('roqueCraft.pause.settings') }}</h2>

        <label class="rc-pause__field">
          <span>
            {{ t('roqueCraft.settings.renderDistance') }}
            <strong>{{ local.renderDistance }}</strong>
          </span>
          <input
            v-model.number="local.renderDistance"
            type="range"
            min="3"
            max="16"
            step="1"
            @change="emitSettings"
          />
        </label>

        <label class="rc-pause__field">
          <span>{{ t('roqueCraft.settings.quality') }}</span>
          <div class="rc-pause__seg rc-pause__seg--wide">
            <button
              v-for="q in qualities"
              :key="q"
              :class="{ 'is-on': local.quality === q }"
              @click="setQuality(q)"
            >
              {{ t(`roqueCraft.settings.quality_${q}`) }}
            </button>
          </div>
        </label>

        <label class="rc-pause__field">
          <span
            >{{ t('roqueCraft.settings.fov') }} <strong>{{ local.fov }}°</strong></span
          >
          <input
            v-model.number="local.fov"
            type="range"
            min="55"
            max="100"
            step="1"
            @input="emitSettings"
          />
        </label>

        <label class="rc-pause__field">
          <span>
            {{ t('roqueCraft.settings.sensitivity') }}
            <strong>{{ local.sensitivity.toFixed(1) }}</strong>
          </span>
          <input
            v-model.number="local.sensitivity"
            type="range"
            min="0.3"
            max="3"
            step="0.1"
            @input="emitSettings"
          />
        </label>

        <label class="rc-pause__toggle">
          <input v-model="local.autoJump" type="checkbox" @change="emitSettings" />
          <span>{{ t('roqueCraft.settings.autoJump') }}</span>
        </label>
        <label class="rc-pause__toggle">
          <input v-model="local.viewBob" type="checkbox" @change="emitSettings" />
          <span>{{ t('roqueCraft.settings.viewBob') }}</span>
        </label>
        <label class="rc-pause__toggle">
          <input v-model="local.showStats" type="checkbox" @change="emitSettings" />
          <span>{{ t('roqueCraft.settings.showStats') }}</span>
        </label>
        <label class="rc-pause__toggle">
          <input v-model="local.sound" type="checkbox" @change="emitSettings" />
          <span>{{ t('roqueCraft.settings.sound') }}</span>
        </label>

        <!-- Trilha em controle PRÓPRIO, não num interruptor junto do resto:
             quem baixa a música normalmente quer continuar ouvindo o passo e o
             bicho chegando. Zero desliga só a trilha. -->
        <label class="rc-pause__field">
          <span>
            {{ t('roqueCraft.settings.music') }}
            <strong>{{ Math.round(local.music * 100) }}%</strong>
          </span>
          <input
            v-model.number="local.music"
            type="range"
            min="0"
            max="1"
            step="0.05"
            @input="emitSettings"
          />
        </label>

        <button class="rc-btn rc-pause__btn" @click="tab = 'menu'">
          {{ t('common.back') }}
        </button>
      </template>

      <template v-else-if="tab === 'controls'">
        <h2 class="rc-pause__title">{{ t('roqueCraft.pause.controls') }}</h2>
        <ul class="rc-pause__keys">
          <li v-for="k in keyHelp" :key="k.k">
            <kbd>{{ k.k }}</kbd
            ><span>{{ t(k.i18n) }}</span>
          </li>
        </ul>
        <button class="rc-btn rc-pause__btn" @click="tab = 'menu'">
          {{ t('common.back') }}
        </button>
      </template>

      <template v-else>
        <h2 class="rc-pause__title">
          {{ venceu ? t('roqueCraft.fim.venceu') : t('roqueCraft.pause.credits') }}
        </h2>
        <p v-if="venceu" class="rc-pause__sub" data-test="rc-venceu">
          {{ t('roqueCraft.fim.venceuLinha') }}
        </p>
        <div class="rc-pause__credits">
          <section v-for="sec in secoes" :key="sec.id">
            <h3>{{ t(sec.t) }}</h3>
            <p v-for="(l, i) in sec.linhas" :key="i">
              <strong v-if="l.forte">{{ l.forte }}</strong>
              <span v-if="l.forte && (l.texto || l.t)"> — </span>
              <span v-if="l.texto">{{ l.texto }}</span>
              <span v-else-if="l.t">{{ t(l.t, l.params || {}) }}</span>
            </p>
          </section>
        </div>
        <button class="rc-btn rc-pause__btn" @click="tab = 'menu'">
          {{ t('common.back') }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { useFocoDeTela } from '../composables/useFocoDeTela.js'
import { creditos } from '../servicos/creditos.js'

const props = defineProps({
  settings: { type: Object, required: true },
  mode: { type: String, default: 'survival' },
  seed: { type: [Number, String], default: 0 },
  mpActive: { type: Boolean, default: false },
  dead: { type: Boolean, default: false },
  deathReason: { type: String, default: '' },
  // O que o carregador de textura devolveu sobre o resource pack local, ou
  // null. Decide se a seção de crédito do pack aparece.
  pack: { type: Object, default: null },
  // O jogador venceu o Fim: a tela abre nos CRÉDITOS, com o título da vitória.
  // É o "rolar os créditos" do original, e é a recompensa de voltar.
  venceu: { type: Boolean, default: false },
})

const emit = defineEmits(['resume', 'lobby', 'settings', 'set-mode', 'respawn'])

const t = useTextos()

// A MALHA DE FOCO. Abrir foca o primeiro controle, Tab e setas circulam sem
// escapar para trás do véu, e fechar devolve o foco a quem abriu. Ver
// `useFocoDeTela` — e `focoDeTela.js` para a regra pura.
const raizDaTela = ref(null)
const { aoTeclar } = useFocoDeTela(raizDaTela)
const tab = ref(props.venceu ? 'credits' : 'menu')
watch(
  () => props.venceu,
  (v) => {
    if (v) tab.value = 'credits'
  },
)
const secoes = computed(() => creditos(props.pack))
const qualities = ['low', 'medium', 'high', 'ultra']
const local = reactive({ ...props.settings })

watch(
  () => props.settings,
  (v) => Object.assign(local, v),
  { deep: true },
)

const emitSettings = () => emit('settings', { ...local })
const setQuality = (q) => {
  local.quality = q
  emitSettings()
}

const keyHelp = [
  { k: 'W A S D', i18n: 'roqueCraft.keys.move' },
  { k: 'Space', i18n: 'roqueCraft.keys.jump' },
  { k: 'Shift', i18n: 'roqueCraft.keys.sneak' },
  { k: 'Ctrl', i18n: 'roqueCraft.keys.sprint' },
  { k: 'F', i18n: 'roqueCraft.keys.fly' },
  { k: 'E', i18n: 'roqueCraft.keys.inventory' },
  { k: '1-9', i18n: 'roqueCraft.keys.hotbar' },
  { k: 'Q', i18n: 'roqueCraft.keys.drop' },
  { k: 'T', i18n: 'roqueCraft.keys.chat' },
  { k: 'Esc', i18n: 'roqueCraft.keys.pause' },
]
</script>

<style lang="scss" scoped>
.rc-pause {
  // Cores de identidade deste app. Ficam aqui, e não em `tokens-root.scss`,
  // porque são do app e não do sistema — mas ficam como custom property
  // para que um tema consiga alcançá-las.
  --rc-pause-bg-1: rgba(8, 9, 12, 0.72);
  --rc-pause-bg-2: rgba(48, 10, 10, 0.72);
  --rc-pause-shadow-1: rgba(0, 0, 0, 0.62);
  --rc-pause-shadow-2: rgba(0, 0, 0, 0.5);
  --rc-pause-shadow-3: rgba(0, 0, 0, 0.3);
  --rc-pause-fg-1: #ff9a92;
}
.rc-pause {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: grid;
  place-items: center;
  // ⚠️ O VÉU ESCURECE, NÃO DESFOCA.
  //
  // Era `blur(6px)` no mundo inteiro. Desfoque de fundo é a assinatura visual
  // de um sistema operacional — e aqui ele custava caro duas vezes: apagava o
  // mundo que o jogador acabou de construir e é o efeito mais pesado da tela
  // num aparelho fraco. Escurecer entrega o mesmo foco no painel e deixa o
  // mundo legível atrás, que é o que uma pausa deveria fazer.
  background: var(--rc-pause-bg-1);
  pointer-events: auto;

  &--death {
    background: var(--rc-pause-bg-2);
  }

  &__panel {
    width: min(420px, 92%);
    max-height: 92%;
    overflow-y: auto;
    padding: var(--ros-space-5, 20px);
    // raio 2px, não 18px: era o `--ros-radius-lg` que dava a este painel a
    // silhueta de caixa de diálogo de aplicativo.
    border-radius: var(--rc-raio);
    background: var(--rc-painel);
    border: 2px solid var(--rc-linha);
    box-shadow:
      inset 0 2px 0 var(--rc-luz),
      inset 2px 0 0 var(--rc-luz),
      inset 0 -2px 0 var(--rc-sombra-forte),
      inset -2px 0 0 var(--rc-sombra-forte),
      0 14px 36px var(--rc-pause-shadow-1);
    color: var(--rc-texto);
    display: flex;
    flex-direction: column;
    gap: var(--ros-space-2, 8px);
  }

  // O título ganha o mesmo relevo escavado do wordmark da tela inicial. É a
  // única peça de texto do painel que pode carregar identidade sem custar
  // legibilidade — abaixo dela é tudo rótulo funcional.
  &__title {
    margin: 0 0 var(--ros-space-3, 12px);
    font-size: var(--ros-text-2xl, 22px);
    font-weight: var(--ros-font-bold, 700);
    letter-spacing: -0.02em;
    text-align: center;
    text-shadow:
      0 2px 0 var(--rc-pause-shadow-2),
      0 3px 0 var(--rc-pause-shadow-3);
    &--death {
      color: var(--rc-pause-fg-1);
    }
  }
  &__sub {
    margin: 0 0 var(--ros-space-3, 12px);
    text-align: center;
    opacity: 0.75;
    font-size: var(--ros-text-md, 14px);
  }

  // Bisel, altura de toque e o afundar-ao-apertar vêm de `.rc-btn`. Aqui só o
  // que é da pausa: no menu vertical o rótulo fica centralizado.
  &__btn {
    justify-content: center;
    font-size: var(--ros-text-md, 14px);

    &--primary {
      background: var(--rc-acao);
      color: var(--rc-acao-texto);
      &:hover:not(:disabled) {
        background: var(--rc-grama);
      }
    }
  }

  &__mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ros-space-2, 8px);
    margin-top: var(--ros-space-2, 8px);
    font-size: var(--ros-text-sm, 12px);
    opacity: 0.85;
  }

  // Segmentado RECUADO: o trilho afunda e a peça escolhida sobe. É a mesma
  // gramática do slot do inventário — buraco recebe, peça se destaca — e resolve
  // sem cor qual dos dois lados está ligado.
  &__seg {
    display: flex;
    border-radius: var(--rc-raio);
    overflow: hidden;
    background: var(--rc-recuo);
    border: 1px solid var(--rc-linha);
    box-shadow: inset 0 2px 0 var(--rc-sombra-forte);
    button {
      min-height: 32px;
      padding: 6px 12px;
      border: 0;
      background: transparent;
      color: var(--rc-texto-2);
      font-size: var(--ros-text-sm, 12px);
      cursor: pointer;
      &.is-on {
        background: var(--rc-painel-alto);
        color: var(--rc-texto);
        font-weight: var(--ros-font-semibold, 600);
        box-shadow:
          inset 0 1px 0 var(--rc-luz),
          inset 0 -2px 0 var(--rc-sombra);
      }
      &:focus-visible {
        outline: 2px solid var(--rc-grama);
        outline-offset: -2px;
      }
    }
    &--wide {
      width: 100%;
      button {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: var(--ros-text-sm, 12px);
    span {
      display: flex;
      justify-content: space-between;
      color: var(--rc-texto-2);
    }
    input[type='range'] {
      width: 100%;
      accent-color: var(--rc-grama);
    }
  }

  &__toggle {
    display: flex;
    align-items: center;
    gap: var(--ros-space-2, 8px);
    font-size: var(--ros-text-sm, 12px);
    cursor: pointer;
    input {
      accent-color: var(--rc-grama);
      width: 16px;
      height: 16px;
    }
  }

  &__seed {
    margin: var(--ros-space-2, 8px) 0 0;
    text-align: center;
    font-size: var(--ros-text-sm, 12px);
    opacity: 0.5;
    font-family: ui-monospace, monospace;
  }

  &__credits {
    text-align: left;
    display: grid;
    gap: var(--ros-space-3, 12px);
    margin: var(--ros-space-2, 8px) 0 var(--ros-space-3, 12px);
    h3 {
      margin: 0 0 4px;
      font-size: var(--ros-text-xs, 10px);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.6;
      font-weight: 600;
    }
    p {
      margin: 0 0 4px;
      font-size: var(--ros-text-sm, 12px);
      line-height: 1.45;
      opacity: 0.9;
    }
    strong {
      font-weight: 650;
    }
  }

  &__keys {
    list-style: none;
    margin: 0 0 var(--ros-space-2, 8px);
    padding: 0;
    display: grid;
    gap: 6px;
    li {
      display: flex;
      align-items: center;
      gap: var(--ros-space-3, 12px);
      font-size: var(--ros-text-sm, 12px);
    }
    // A tecla é uma PEÇA: bisel saliente, canto duro. Antes era um chip
    // arredondado, que lê como etiqueta e não como algo que se aperta.
    kbd {
      min-width: 70px;
      padding: 3px 7px;
      border-radius: 0;
      background: var(--rc-painel-alto);
      border: 1px solid var(--rc-linha);
      box-shadow:
        inset 0 1px 0 var(--rc-luz),
        inset 0 -2px 0 var(--rc-sombra);
      font-family: ui-monospace, monospace;
      font-size: var(--ros-text-xs, 10px);
      text-align: center;
    }
    span {
      opacity: 0.8;
    }
  }
}

@media (max-width: 600px) {
  .rc-pause__panel {
    padding: var(--ros-space-4, 16px);
    padding-bottom: calc(var(--ros-space-4, 16px) + env(safe-area-inset-bottom));
  }
}
</style>
