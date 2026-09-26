<template>
  <div class="rc-lobby" @click.self="$emit('close')" ref="raizDaTela" @keydown="aoTeclar">
    <div
      class="rc-lobby__panel ros-scrollbar-dark"
      role="dialog"
      aria-modal="true"
      :aria-label="t('roqueCraft.title')"
    >
      <button class="rc-lobby__x" :aria-label="t('common.close')" @click="$emit('close')">
        <RCIcon nome="fechar" :size="14" />
      </button>
      <h3 class="rc-lobby__title">
        <RCIcon nome="gente" :size="18" />{{ t('roqueCraft.mp.title') }}
      </h3>

      <!-- Escolha de skin. Fica ANTES de criar/entrar de propósito: dentro da
           sala já é tarde, o pessoal só descobre que são bonecos iguais quando
           está todo mundo junto. -->
      <div v-if="hasAccount" class="rc-lobby__skins">
        <span class="rc-lobby__skins-label">{{ t('roqueCraft.mp.skin') }}</span>
        <div class="rc-lobby__skins-row">
          <button
            v-for="s in skins"
            :key="s.id"
            class="rc-lobby__skin"
            :class="{ 'is-on': s.id === skin }"
            :title="t(`roqueCraft.mp.skins.${s.id}`)"
            :aria-label="t(`roqueCraft.mp.skins.${s.id}`)"
            :aria-pressed="s.id === skin"
            @click="$emit('skin', s.id)"
          >
            <span class="rc-lobby__skin-hair" :style="{ background: hex(s.cabelo) }" />
            <span class="rc-lobby__skin-face" :style="{ background: hex(s.pele) }" />
            <span class="rc-lobby__skin-body" :style="{ background: hex(s.camisa) }" />
          </button>
        </div>
      </div>

      <p v-if="!hasAccount" class="rc-lobby__hint rc-lobby__hint--big">
        {{ t('roqueCraft.mp.needAccount') }}
      </p>

      <template v-else-if="mp.mode === 'menu'">
        <button class="rc-lobby__action" @click="$emit('host')">
          <RCIcon nome="mais" :size="22" />
          <span>
            <strong>{{ t('roqueCraft.mp.createRoom') }}</strong>
            <small>{{ t('roqueCraft.mp.createHint') }}</small>
          </span>
        </button>
        <div class="rc-lobby__sep">{{ t('roqueCraft.mp.or') }}</div>
        <div class="rc-lobby__join">
          <input
            :value="mp.codeInput"
            class="rc-lobby__input"
            :placeholder="t('roqueCraft.mp.codePlaceholder')"
            maxlength="5"
            autocapitalize="characters"
            :aria-label="t('roqueCraft.mp.codePlaceholder')"
            @input="$emit('code', $event.target.value.toUpperCase())"
            @keyup.enter="$emit('join')"
          />
          <button class="rc-lobby__btn" @click="$emit('join')">
            {{ t('roqueCraft.mp.join') }}
          </button>
        </div>
        <p class="rc-lobby__hint">{{ t('roqueCraft.mp.joinHint') }}</p>
        <p v-if="mp.error" class="rc-lobby__err">{{ t(`roqueCraft.mp.${mp.error}`) }}</p>
      </template>

      <div v-else-if="mp.mode === 'creating' || mp.mode === 'joining'" class="rc-lobby__loading">
        <!-- O `q-spinner-dots` do Quasar, desenhado igual: o jogo roda sem o
             Quasar, e são três círculos em SVG (o mesmo `innerHTML` do
             componente dele, com a cor branca e o tamanho de antes). -->
        <svg
          class="rc-lobby__spinner"
          fill="currentColor"
          width="36px"
          height="36px"
          viewBox="0 0 120 30"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="15" cy="15" r="15">
            <animate
              attributeName="r"
              from="15"
              to="15"
              begin="0s"
              dur="0.8s"
              values="15;9;15"
              calcMode="linear"
              repeatCount="indefinite"
            />
            <animate
              attributeName="fill-opacity"
              from="1"
              to="1"
              begin="0s"
              dur="0.8s"
              values="1;.5;1"
              calcMode="linear"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="60" cy="15" r="9" fill-opacity=".3">
            <animate
              attributeName="r"
              from="9"
              to="9"
              begin="0s"
              dur="0.8s"
              values="9;15;9"
              calcMode="linear"
              repeatCount="indefinite"
            />
            <animate
              attributeName="fill-opacity"
              from=".5"
              to=".5"
              begin="0s"
              dur="0.8s"
              values=".5;1;.5"
              calcMode="linear"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="105" cy="15" r="15">
            <animate
              attributeName="r"
              from="15"
              to="15"
              begin="0s"
              dur="0.8s"
              values="15;9;15"
              calcMode="linear"
              repeatCount="indefinite"
            />
            <animate
              attributeName="fill-opacity"
              from="1"
              to="1"
              begin="0s"
              dur="0.8s"
              values="1;.5;1"
              calcMode="linear"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
        <span>{{ t(`roqueCraft.mp.${mp.mode}`) }}</span>
      </div>

      <template v-else-if="mp.mode === 'connected'">
        <div class="rc-lobby__code">
          <span class="rc-lobby__code-label">{{ t('roqueCraft.mp.code') }}</span>
          <strong class="rc-lobby__code-val">{{ mp.code }}</strong>
        </div>
        <img v-if="mp.qr" :src="mp.qr" class="rc-lobby__qr" :alt="t('roqueCraft.mp.scanQr')" />
        <p class="rc-lobby__hint">{{ t('roqueCraft.mp.scanQr') }}</p>

        <ul class="rc-lobby__players">
          <li v-for="p in players" :key="p.uid">
            <span class="rc-lobby__dot" :style="{ background: corDoJogador(p) }" />
            <span class="rc-lobby__pname">{{ p.name || t('roqueCraft.mp.player') }}</span>
            <span class="rc-lobby__phealth">{{ Math.round(p.health) }}</span>
          </li>
        </ul>

        <div class="rc-lobby__row">
          <button class="rc-lobby__btn" @click="$emit('copy')">
            <RCIcon nome="copiar" :size="13" />{{ t('roqueCraft.mp.copyInvite') }}
          </button>
          <button class="rc-lobby__btn rc-lobby__btn--leave" @click="$emit('leave')">
            <RCIcon nome="sair" :size="13" />{{ t('roqueCraft.mp.leave') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import RCIcon from './RCIcon.vue'
import { ref } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { useFocoDeTela } from '../composables/useFocoDeTela.js'
import { SKINS, skinDe } from '../servicos/skins.js'

defineProps({
  mp: { type: Object, required: true },
  players: { type: Array, default: () => [] },
  hasAccount: { type: Boolean, default: false },
  skin: { type: String, default: '' },
})

defineEmits(['close', 'host', 'join', 'code', 'copy', 'leave', 'skin'])

const t = useTextos()

// A MALHA DE FOCO. Abrir foca o primeiro controle, Tab e setas circulam sem
// escapar para trás do véu, e fechar devolve o foco a quem abriu. Ver
// `useFocoDeTela` — e `focoDeTela.js` para a regra pura.
const raizDaTela = ref(null)
const { aoTeclar } = useFocoDeTela(raizDaTela)
const skins = SKINS

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`

// A bolinha da lista usa a MESMA cor do boneco no mundo. Com um hash próprio
// aqui, a lista e o jogo discordavam e a lista deixava de servir pra achar
// alguém.
const corDoJogador = (p) => hex(skinDe(p.skin, p.uid || p.name).camisa)
</script>

<style lang="scss" scoped>
@import './styles/rc-lobby.scss';
</style>
