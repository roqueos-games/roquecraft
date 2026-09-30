<template>
  <div
    class="rc-cri"
    @click.self="$emit('close')"
    @contextmenu.prevent
    ref="raizDaTela"
    @keydown="aoTeclar"
  >
    <div
      class="rc-cri__painel rc-painel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('roqueCraft.criativo.titulo')"
    >
      <header class="rc-cri__head">
        <h3 class="rc-cri__titulo">{{ t('roqueCraft.criativo.titulo') }}</h3>
        <button class="rc-cri__x rc-btn" :aria-label="t('common.close')" @click="$emit('close')">
          <RCIcon nome="fechar" :size="14" />
        </button>
      </header>

      <!-- ⚠️ A FILA DE ABAS É UM `tablist` DE VERDADE, e não três botões que
           parecem abas. É o `role` que faz a seta trocar de aba no leitor de
           tela, e é ele que a malha de foco consulta para NÃO roubar a seta
           (ver `usaAsSetas` em `focoDeTela.js`). Só a aba ativa é focável pelo
           Tab; entre elas, anda-se com a seta — é o padrão ARIA, e é o que o
           jogador de teclado já espera de qualquer painel com abas. -->
      <div
        class="rc-cri__abas"
        role="tablist"
        aria-orientation="horizontal"
        :aria-label="t('roqueCraft.criativo.titulo')"
      >
        <button
          v-for="a in ABAS"
          :id="`rc-cri-aba-${a.chave}`"
          :key="a.chave"
          class="rc-cri__aba rc-btn"
          :class="{ 'is-on': aba === a.chave }"
          role="tab"
          :aria-selected="aba === a.chave"
          :aria-controls="`rc-cri-painel-${a.chave}`"
          :tabindex="aba === a.chave ? 0 : -1"
          :data-test="`rc-cri-aba-${a.chave}`"
          @click="aba = a.chave"
          @keydown="andarNasAbas"
        >
          {{ t(a.i18n) }}
        </button>
      </div>

      <!-- ⚠️ `v-if` E NÃO `v-show`, E A RAZÃO É O FOCO. Com `v-show` o conteúdo
           da aba escondida continua no DOM, e a malha de foco da tela varre a
           raiz inteira: o Tab pousaria no controle de uma aba que o jogador não
           está vendo. No navegador `checkVisibility` filtraria, mas depender
           disso é depender de layout para uma regra de navegação. Fora do DOM,
           não há o que filtrar. -->
      <!-- ── A HORA ─────────────────────────────────────────────────────── -->
      <section
        v-if="aba === 'hora'"
        id="rc-cri-painel-hora"
        class="rc-cri__bloco"
        role="tabpanel"
        aria-labelledby="rc-cri-aba-hora"
      >
        <div class="rc-cri__linha">
          <label for="rc-cri-hora">{{ t('roqueCraft.criativo.hora') }}</label>
          <b class="rc-cri__valor" data-test="rc-cri-relogio">{{ relogio }}</b>
        </div>
        <input
          id="rc-cri-hora"
          class="rc-cri__range rc-recuo"
          type="range"
          min="0"
          max="1"
          step="0.001"
          :value="fracao"
          data-test="rc-cri-hora"
          @input="mudarHora($event.target.value)"
        />
        <div class="rc-cri__botoes">
          <button
            v-for="h in HORAS"
            :key="h.chave"
            class="rc-cri__chip rc-btn"
            :class="{ 'is-on': ticks === h.ticks }"
            :data-test="`rc-cri-${h.chave}`"
            @click="irPara(h.ticks)"
          >
            {{ t(`roqueCraft.criativo.${h.chave}`) }}
          </button>
        </div>
        <label class="rc-cri__check">
          <input
            type="checkbox"
            :checked="travado"
            data-test="rc-cri-travar"
            @change="$emit('travar', $event.target.checked)"
          />
          <span>{{ t('roqueCraft.criativo.travar') }}</span>
        </label>
      </section>

      <!-- ── O CLIMA ────────────────────────────────────────────────────── -->
      <section
        v-if="aba === 'clima'"
        id="rc-cri-painel-clima"
        class="rc-cri__bloco"
        role="tabpanel"
        aria-labelledby="rc-cri-aba-clima"
      >
        <div class="rc-cri__linha">
          <label for="rc-cri-chuva">{{ t('roqueCraft.criativo.chuva') }}</label>
          <b class="rc-cri__valor" data-test="rc-cri-estado">{{ rotuloDoClima }}</b>
        </div>
        <input
          id="rc-cri-chuva"
          class="rc-cri__range rc-recuo"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="chuva ?? 0"
          data-test="rc-cri-chuva"
          @input="$emit('chuva', Number($event.target.value))"
        />
        <!-- A tempestade SAI da chuva (acima de 0,55), e o painel diz isso em vez
             de oferecer um segundo controle que discordaria do primeiro. -->
        <div class="rc-cri__linha rc-cri__sub">
          <span>{{ t('roqueCraft.criativo.tempestade') }}</span>
          <b data-test="rc-cri-tempestade">{{ Math.round(leitura.tempestade * 100) }}%</b>
        </div>
        <button
          class="rc-cri__chip rc-btn"
          :disabled="!leitura.comRaio"
          data-test="rc-cri-raio"
          @click="$emit('raio')"
        >
          {{ t('roqueCraft.criativo.raio') }}
        </button>
      </section>

      <!-- ── OS LUGARES ─────────────────────────────────────────────────── -->
      <section
        v-if="aba === 'lugares'"
        id="rc-cri-painel-lugares"
        class="rc-cri__bloco"
        role="tabpanel"
        aria-labelledby="rc-cri-aba-lugares"
      >
        <div class="rc-cri__linha">
          <span>{{ t('roqueCraft.criativo.lugares') }}</span>
          <b class="rc-cri__valor" data-test="rc-cri-dimensao">{{ rotuloDaDimensao }}</b>
        </div>
        <!-- ⚠️ O DESTINO DE AGORA FICA DESLIGADO, e não escondido. Some da
             lista, o jogador procura para onde foi; desligado, ele lê "estou
             aqui" — que é a informação que a fila de três botões dá de graça. -->
        <div class="rc-cri__botoes">
          <button
            v-for="l in LUGARES"
            :key="l.chave"
            class="rc-cri__chip rc-btn"
            :class="{ 'is-on': dimensao === l.chave }"
            :disabled="dimensao === l.chave || emSala"
            :data-test="`rc-cri-ir-${l.chave}`"
            @click="$emit('teleportar', l.chave)"
          >
            {{ t(l.i18n) }}
          </button>
        </div>
        <!-- Em sala não se atravessa, e o painel DIZ em vez de só desligar os
             botões: um controle cinza sem motivo lê como defeito. -->
        <p v-if="emSala" class="rc-cri__sub" data-test="rc-cri-sala">
          {{ t('roqueCraft.criativo.naSalaNao') }}
        </p>

        <!-- OS LUGARES DO MUNDO (Goal 23, onda 4). A cama sem cama fica
             desligada, e não escondida: o jogador lê "ainda não dormi". -->
        <div class="rc-cri__botoes">
          <button
            v-for="l in LUGARES_DO_MUNDO"
            :key="l.chave"
            class="rc-cri__chip rc-btn"
            :disabled="emSala || (l.chave === 'cama' && !temCama)"
            :data-test="`rc-cri-lugar-${l.chave}`"
            @click="$emit('lugar', l.chave)"
          >
            {{ t(l.i18n) }}
          </button>
        </div>

        <!-- A COORDENADA. Três campos e um botão; Enter em qualquer campo é o
             botão. O Y é opcional: vazio é "o chão". -->
        <form class="rc-cri__coord" @submit.prevent="irACoordenada">
          <label class="rc-cri__campo">
            <span>X</span>
            <input
              v-model="coordX"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              data-test="rc-cri-x"
              :aria-label="`${t('roqueCraft.criativo.coordenada')} X`"
            />
          </label>
          <label class="rc-cri__campo">
            <span>Y</span>
            <input
              v-model="coordY"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              data-test="rc-cri-y"
              :placeholder="t('roqueCraft.criativo.chao')"
              :aria-label="`${t('roqueCraft.criativo.coordenada')} Y`"
            />
          </label>
          <label class="rc-cri__campo">
            <span>Z</span>
            <input
              v-model="coordZ"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              data-test="rc-cri-z"
              :aria-label="`${t('roqueCraft.criativo.coordenada')} Z`"
            />
          </label>
          <button
            type="submit"
            class="rc-cri__chip rc-btn"
            :disabled="emSala"
            data-test="rc-cri-ir-coordenada"
          >
            {{ t('roqueCraft.criativo.ir') }}
          </button>
        </form>

        <!-- VOLTAR de onde veio: desligado quando não há de onde. -->
        <button
          class="rc-cri__chip rc-btn"
          :disabled="emSala || !podeVoltar"
          data-test="rc-cri-voltar"
          @click="$emit('voltar')"
        >
          {{ t('roqueCraft.criativo.voltar') }}
        </button>
      </section>

      <button class="rc-cri__soltar rc-btn" data-test="rc-cri-soltar" @click="$emit('soltar')">
        {{ t('roqueCraft.criativo.soltar') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { useFocoDeTela } from '../composables/useFocoDeTela.js'
import RCIcon from './RCIcon.vue'
import {
  ABAS,
  ABA_PADRAO,
  LUGARES,
  LUGARES_DO_MUNDO,
  abaVizinha,
  HORAS,
  ticksDaFracao,
  fracaoDosTicks,
  leituraDoClima,
} from '../servicos/criativo.js'
import { clockLabel } from '../servicos/daycycle.js'

const props = defineProps({
  ticks: { type: Number, default: 0 },
  travado: { type: Boolean, default: false },
  // `null` = o mundo decide. Ver `estadoInicial` em `criativo.js`.
  chuva: { type: Number, default: null },
  // O bioma VIVO, para o painel dizer se vai cair chuva ou neve. Vem de fora
  // porque é dado do mundo, e um serviço puro não conhece o mundo.
  bioma: { type: String, default: '' },
  neva: { type: Boolean, default: false },
  /** A dimensão VIVA: o painel desliga o botão de onde o jogador já está. */
  dimensao: { type: String, default: 'overworld' },
  /** Em sala não se atravessa — a dimensão no multijogador é outra fatia. */
  emSala: { type: Boolean, default: false },
  /** Há de onde voltar: algum teleporte já saiu daqui. */
  podeVoltar: { type: Boolean, default: false },
  /** O jogador já dormiu: a cama existe para ir. */
  temCama: { type: Boolean, default: false },
})
const emit = defineEmits([
  'close',
  'hora',
  'travar',
  'chuva',
  'raio',
  'soltar',
  'teleportar',
  'lugar',
  'coordenada',
  'voltar',
])

const t = useTextos()

// A MALHA DE FOCO. Abrir foca o primeiro controle, Tab e setas circulam sem
// escapar para trás do véu, e fechar devolve o foco a quem abriu. Ver
// `useFocoDeTela` — e `focoDeTela.js` para a regra pura.
const raizDaTela = ref(null)
const { aoTeclar } = useFocoDeTela(raizDaTela)

// ⚠️ A ABA É ESTADO DO PAINEL, e não do jogo: reabrir o criativo volta para a
// hora, que é o que o jogador usa toda vez. Guardar no save daria um painel que
// abre onde ele esteve da última vez — útil uma vez, confuso nas outras.
const aba = ref(ABA_PADRAO)

/** A seta anda na fila de abas, e leva o foco junto — é o padrão ARIA. */
function andarNasAbas(e) {
  // Home e End vão às pontas — é o padrão ARIA de `tablist`, e com duas abas
  // parece supérfluo; com quatro (as ondas seguintes deste goal acrescentam
  // teleporte) é a diferença entre uma tecla e três.
  const ponta = e.code === 'Home' ? ABAS[0].chave : e.code === 'End' ? ABAS.at(-1).chave : null
  const passo = e.code === 'ArrowRight' ? 1 : e.code === 'ArrowLeft' ? -1 : 0
  if (!passo && !ponta) return
  e.preventDefault()
  e.stopPropagation()
  aba.value = ponta ?? abaVizinha(aba.value, passo)
  // O foco SEGUE a aba: sem isto a próxima seta partiria da aba antiga, e o
  // jogador veria a seleção pular de dois em dois.
  nextTick(() => document.getElementById(`rc-cri-aba-${aba.value}`)?.focus())
}

const fracao = computed(() => fracaoDosTicks(props.ticks))
const relogio = computed(() => clockLabel(props.ticks))
const leitura = computed(() => leituraDoClima(props.chuva ?? 0))

const rotuloDaDimensao = computed(() =>
  t(LUGARES.find((l) => l.chave === props.dimensao)?.i18n ?? 'roqueCraft.criativo.supermundo'),
)

const rotuloDoClima = computed(() => {
  if (props.chuva == null) return t('roqueCraft.criativo.doMundo')
  if (!leitura.value.precipita) return t('roqueCraft.criativo.limpo')
  return props.neva ? t('roqueCraft.criativo.neve') : t('roqueCraft.criativo.chovendo')
})

const mudarHora = (v) => emit('hora', ticksDaFracao(Number(v)))
const irPara = (ticks) => emit('hora', ticks)

// A coordenada digitada fica como TEXTO até o clique: quem decide se é número
// é `coordenadaDigitada` (criativo.js), e o painel não tem uma segunda regra.
const coordX = ref('')
const coordY = ref('')
const coordZ = ref('')
const irACoordenada = () =>
  emit('coordenada', { x: coordX.value, y: coordY.value, z: coordZ.value })
</script>

<style scoped lang="scss">
//
// ⚠️ ESTE PAINEL NASCEU COM CARA DE APLICATIVO, e o founder viu na hora: raio
// 12px, sombra difusa, cinza neutro e cores próprias inventadas aqui. O jogo
// tem design system — `src/css/roquecraft.scss` — com painel de bisel escavado,
// raio 2px e uma paleta que sai das MESMAS cores das texturas do mundo. Um menu
// que não usa os primitivos é uma janela de outro programa aberta por cima do
// jogo.
//
// Por isso aqui quase não há cor: `.rc-painel`, `.rc-btn`, `.rc-relevo` e
// `.rc-recuo` são classes GLOBAIS, e o que sobra para este arquivo é layout.
//
// A cor do véu como token local, no mesmo padrão do `RCPause`: a catraca
// `cores-cravadas` recusa cor dentro de regra, e com razão.
.rc-cri {
  --rc-cri-veu: rgba(8, 9, 12, 0.72);
}

.rc-cri {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: grid;
  place-items: center;
  // O véu ESCURECE e não desfoca, como na pausa: desfocar apaga o mundo que o
  // jogador acabou de construir, e é o efeito mais caro da tela num aparelho
  // fraco.
  background: var(--rc-cri-veu);
  pointer-events: auto;

  &__painel {
    width: min(380px, 92%);
    max-height: 92%;
    overflow-y: auto;
    padding: var(--ros-space-5, 20px);
    color: var(--rc-texto);
    display: flex;
    flex-direction: column;
    gap: var(--ros-space-2, 8px);
  }

  // A FILA DE ABAS. Sem cor própria: `.rc-btn` é o primitivo do jogo, e o que
  // sobra aqui é o arranjo. A aba ativa usa a mesma marca de `is-on` dos chips
  // de hora, que o jogador já aprendeu neste mesmo painel.
  &__abas {
    display: flex;
    gap: var(--ros-space-1, 4px);
    margin-bottom: var(--ros-space-1, 4px);
  }

  &__aba {
    flex: 1;
    min-height: 0;
    padding: var(--ros-space-2, 8px) var(--ros-space-1, 4px);
    font-size: var(--ros-text-sm, 12px);
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ros-space-3, 12px);
  }

  &__titulo {
    margin: 0;
    font-size: var(--ros-text-xl, 18px);
    font-weight: var(--ros-font-bold, 700);
    letter-spacing: -0.02em;
    text-shadow: 0 2px 0 var(--rc-sombra);
  }

  &__x {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    padding: 0;
    min-height: 0;
    background: var(--rc-painel-alto);
    color: inherit;
    cursor: pointer;
  }

  &__bloco {
    display: flex;
    flex-direction: column;
    gap: var(--ros-space-2, 8px);
    padding-top: var(--ros-space-3, 12px);
    border-top: 1px solid var(--rc-linha);
  }

  &__linha {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ros-space-3, 12px);
    font-size: var(--ros-text-md, 14px);
    color: var(--rc-texto-2);
  }

  &__valor {
    font-variant-numeric: tabular-nums;
    color: var(--rc-texto);
    font-weight: 600;
  }

  // O trilho é RECUADO: é a peça que recebe, como o slot do inventário.
  &__range {
    width: 100%;
    height: 22px;
    padding: 0 2px;
    accent-color: var(--rc-acao);
    cursor: pointer;
  }

  &__botoes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ros-space-2, 8px);
  }

  // Botão curto: o `.rc-btn` global é de largura cheia e alinhado à esquerda,
  // que é certo para uma lista de menu e errado para quatro atalhos em grade.
  &__chip {
    justify-content: center;
    min-height: 34px;
    padding: var(--ros-space-2, 8px);
    font-size: var(--ros-text-sm, 12px);
    text-align: center;

    &.is-on {
      background: var(--rc-acao);
      color: var(--rc-acao-texto);
    }
  }

  // A COORDENADA: três campos curtos e o botão, numa linha. O campo usa o
  // mesmo recuo escavado dos slots (`--rc-recuo`), e não uma caixa própria.
  &__coord {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto;
    gap: var(--ros-space-2, 8px);
    align-items: end;
  }

  &__campo {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: var(--ros-text-sm, 12px);

    input {
      width: 100%;
      min-width: 0;
      min-height: 34px;
      padding: 0 var(--ros-space-2, 8px);
      border: 2px solid var(--rc-linha);
      border-radius: 0;
      background: var(--rc-recuo);
      color: var(--rc-texto);
      font-family: ui-monospace, monospace;
      font-size: var(--ros-text-md, 14px);

      &:focus {
        outline: none;
        border-color: var(--rc-acao);
      }
    }
  }

  &__check {
    display: flex;
    gap: var(--ros-space-3, 12px);
    align-items: center;
    cursor: pointer;
    font-size: var(--ros-text-md, 14px);

    input {
      width: 18px;
      height: 18px;
      accent-color: var(--rc-acao);
      cursor: pointer;
    }
  }

  &__soltar {
    justify-content: center;
    margin-top: var(--ros-space-2, 8px);
  }
}
</style>
