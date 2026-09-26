<template>
  <div
    class="rc-com"
    @click.self="$emit('close')"
    @contextmenu.prevent
    ref="raizDaTela"
    @keydown="aoTeclar"
  >
    <div class="rc-com__painel rc-painel" role="dialog" aria-modal="true" :aria-label="titulo">
      <header class="rc-com__head">
        <h3 class="rc-com__titulo" data-test="rc-com-titulo">{{ titulo }}</h3>
        <button class="rc-com__x rc-btn" :aria-label="t('common.close')" @click="$emit('close')">
          <RCIcon nome="fechar" :size="14" />
        </button>
      </header>

      <!-- ⚠️ A PESSOA VEM ANTES DO BALCÃO. Enquanto esta tela abria direto nas
           ofertas, nove aldeões eram nove máquinas de venda com pernas: o
           jogador não sabia o nome de nenhum e não tinha motivo para voltar ao
           mesmo. Nome, humor e amizade primeiro; o comércio embaixo. -->
      <section v-if="conversa" class="rc-com__npc rc-recuo" data-test="rc-npc">
        <div class="rc-com__quem">
          <b data-test="rc-npc-nome">{{ conversa.nome }}</b>
          <span class="rc-com__humor" data-test="rc-npc-humor">{{
            t(`roqueCraft.npc.humor.${conversa.humor}`)
          }}</span>
        </div>

        <!-- A amizade À VISTA, porque ela MUDA O PREÇO. Um número escondido que
             desconta a esmeralda é um desconto que ninguém entende de onde vem. -->
        <div
          class="rc-com__amizade"
          role="progressbar"
          :aria-valuenow="conversa.amizade"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-label="t('roqueCraft.npc.amizade')"
          data-test="rc-npc-amizade"
        >
          <i :style="{ width: `${conversa.amizade}%` }" />
        </div>

        <p class="rc-com__fala" data-test="rc-npc-fala">
          <span v-if="conversa.pensando" class="rc-com__pensando">{{
            t('roqueCraft.npc.pensando')
          }}</span>
          <span v-else>{{ conversa.texto || t('roqueCraft.npc.silencio') }}</span>
        </p>

        <div class="rc-com__acoes">
          <button class="rc-btn" data-test="rc-npc-falar" @click="$emit('acao', 'saudacao')">
            {{ t('roqueCraft.npc.conversar') }}
          </button>
          <button class="rc-btn" data-test="rc-npc-oficio" @click="$emit('acao', 'oficio')">
            {{ t('roqueCraft.npc.oficio') }}
          </button>
          <button
            class="rc-btn"
            data-test="rc-npc-presente"
            :disabled="!conversa.presente"
            :title="
              conversa.presente ? nomeDoItem(conversa.presente) : t('roqueCraft.npc.semPresente')
            "
            @click="$emit('acao', 'presentear', conversa.presente)"
          >
            {{ t('roqueCraft.npc.presentear') }}
          </button>
        </div>

        <!-- ⚠️ A CAIXA SÓ APARECE QUANDO HÁ COM QUEM FALAR. Um campo de texto
             que sempre devolve a mesma frase de tabela promete uma conversa que
             não existe, e o jogador descobre isso na terceira pergunta. -->
        <form v-if="conversa.modelo" class="rc-com__caixa" @submit.prevent="perguntar">
          <input
            v-model="pergunta"
            data-test="rc-npc-pergunta"
            maxlength="200"
            :placeholder="t('roqueCraft.npc.pergunte')"
            :disabled="conversa.pensando"
          />
          <button class="rc-btn" type="submit" :disabled="conversa.pensando || !pergunta.trim()">
            {{ t('roqueCraft.npc.enviar') }}
          </button>
        </form>
      </section>

      <p v-if="!ofertas.length" class="rc-com__vazio rc-recuo" data-test="rc-com-vazio">
        {{ t('roqueCraft.comercio.semOfertas') }}
      </p>

      <ul v-else class="rc-com__lista">
        <li
          v-for="o in ofertas"
          :key="o.indice"
          class="rc-com__linha rc-recuo"
          data-test="rc-com-linha"
        >
          <!-- O QUE SE PAGA -->
          <span class="rc-com__lado">
            <span v-for="(p, i) in o.paga" :key="i" class="rc-com__item">
              <img v-if="icons[p.item]" :src="icons[p.item]" :alt="nomeDoItem(p.item)" />
              <b>{{ p.count }}</b>
            </span>
          </span>

          <RCIcon nome="seta" :size="14" class="rc-com__seta" />

          <!-- O QUE SE LEVA -->
          <span class="rc-com__lado">
            <span class="rc-com__item">
              <img
                v-if="icons[o.recebe.item]"
                :src="icons[o.recebe.item]"
                :alt="nomeDoItem(o.recebe.item)"
              />
              <b>{{ o.recebe.count }}</b>
            </span>
          </span>

          <button
            class="rc-com__botao"
            data-test="rc-com-trocar"
            :disabled="!!o.motivo"
            :aria-label="rotuloDaOferta(o)"
            :title="o.motivo ? t(`roqueCraft.comercio.${o.motivo}`) : rotuloDaOferta(o)"
            @click="$emit('acao', 'trocar', o.indice)"
          >
            {{ t('roqueCraft.comercio.trocar') }}
          </button>

          <!-- ⚠️ O ESTOQUE FICA À VISTA. Sem ele, o botão desabilitado por
               "esgotada" parece defeito; com ele, o jogador entende que o
               aldeão repõe e volta depois. -->
          <span class="rc-com__estoque" data-test="rc-com-estoque"
            >{{ o.restam }}/{{ o.usos }}</span
          >
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { useFocoDeTela } from '../composables/useFocoDeTela.js'
import { itemDef } from '../servicos/items.js'
import RCIcon from './RCIcon.vue'

const props = defineProps({
  /** O aldeão como pessoa: `{nome, oficio, amizade, humor, texto, fonte, pensando}`. */
  conversa: { type: Object, default: null },
  ofertas: { type: Array, required: true },
  icons: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'acao'])

const t = useTextos()

// A MALHA DE FOCO. Abrir foca o primeiro controle, Tab e setas circulam sem
// escapar para trás do véu, e fechar devolve o foco a quem abriu. Ver
// `useFocoDeTela` — e `focoDeTela.js` para a regra pura.
const raizDaTela = ref(null)
const { aoTeclar } = useFocoDeTela(raizDaTela)
const pergunta = ref('')
function perguntar() {
  const texto = pergunta.value.trim()
  if (!texto) return
  // ⚠️ LIMPA ANTES DE ENVIAR. Deixar o texto na caixa convida a reenviar a
  // mesma pergunta enquanto a primeira ainda está no ar, e cada reenvio é uma
  // chamada de modelo que ninguém pediu.
  pergunta.value = ''
  emit('acao', 'perguntar', texto)
}

// ⚠️ O TÍTULO É O OFÍCIO, e o NOME fica no corpo. Trocar os dois faria o
// cabeçalho dizer "Benedito" sem dizer o que ele vende — e a primeira coisa que
// o jogador procura ao abrir um balcão é o que tem à venda.
//
// ⚠️ E NUNCA VAZIO. Aldeão sem persona (o que nasce de `spawnMob`, e qualquer
// um antes de a persona chegar) não tem ofício, e o cabeçalho ficava sendo um
// `x` solto sobre uma faixa cinza — medido na sonda do menu, em 16/09.
const titulo = computed(() =>
  props.conversa?.oficio
    ? t(`roqueCraft.comercio.profissao.${props.conversa.oficio}`)
    : t('roqueCraft.comercio.titulo'),
)
const nomeDoItem = (key) => {
  const def = itemDef(key)
  return def ? t(def.i18n) : key
}
/** O rótulo diz a troca inteira: quem usa leitor de tela não vê os ícones. */
const rotuloDaOferta = (o) =>
  t('roqueCraft.comercio.rotulo', {
    paga: o.paga.map((p) => `${p.count} ${nomeDoItem(p.item)}`).join(' + '),
    recebe: `${o.recebe.count} ${nomeDoItem(o.recebe.item)}`,
  })
</script>

<style lang="scss" scoped>
//
// ⚠️ ESTE PAINEL ESTAVA FORA DO DESIGN SYSTEM DO JOGO, e o founder viu antes de
// mim: "a janela de diálogo também está horrível". Ele tinha paleta própria
// (`#2b2b2b`, `#1a1a1a`, `#8b8b8b`), borda chapada de 2px, `font-family:
// monospace` no painel inteiro e um `x` que era um quadrado com contorno cinza.
// Ao lado da pausa e do inventário — bisel escavado, painel `#2a2825`, fonte do
// jogo — lia como uma caixa de diálogo de outro programa.
//
// `src/css/roquecraft.scss` já tem os primitivos (`.rc-painel`, `.rc-btn`,
// `.rc-relevo`, `.rc-recuo`) e a paleta tirada das texturas do mundo. O que
// sobra aqui é layout e as duas cores que são DESTE painel: a barra de amizade
// e a marca do modelo de IA.
//
.rc-com {
  --rc-com-veu: rgba(8, 9, 12, 0.72);
  --rc-com-amizade: #6ec06e;
  --rc-com-modelo: #c9a227;
}

.rc-com {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: var(--rc-com-veu);
  pointer-events: auto;

  &__painel {
    width: min(360px, 92%);
    max-height: 88%;
    overflow-y: auto;
    padding: var(--ros-space-4, 16px);
    color: var(--rc-texto);
    display: flex;
    flex-direction: column;
    gap: var(--ros-space-3, 12px);
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ros-space-3, 12px);
  }

  &__titulo {
    margin: 0;
    font-size: var(--ros-text-lg, 16px);
    font-weight: var(--ros-font-bold, 700);
    text-shadow: 0 2px 0 var(--rc-sombra);
  }

  &__x {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    min-height: 0;
    padding: 0;
    background: var(--rc-painel-alto);
    color: inherit;
    cursor: pointer;
  }

  // A ficha da pessoa é RECUADA: é o que o painel contém, não o que ele oferece.
  &__npc {
    display: grid;
    gap: var(--ros-space-2, 8px);
    padding: var(--ros-space-3, 12px);
  }

  &__quem {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--ros-space-2, 8px);
    font-size: var(--ros-text-md, 14px);
  }

  &__humor {
    font-size: var(--ros-text-sm, 12px);
    color: var(--rc-texto-2);
  }

  &__amizade {
    height: 6px;
    background: var(--rc-recuo);

    i {
      display: block;
      height: 100%;
      background: var(--rc-com-amizade);
    }
  }

  &__fala {
    min-height: 2.6em;
    margin: 0;
    font-size: var(--ros-text-md, 14px);
    line-height: 1.35;
  }

  &__pensando {
    color: var(--rc-texto-2);
    font-style: italic;
  }

  &__acoes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ros-space-2, 8px);

    button {
      justify-content: center;
      min-height: 30px;
      padding: var(--ros-space-1, 4px) var(--ros-space-3, 12px);
      font-size: var(--ros-text-sm, 12px);

      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
    }
  }

  &__caixa {
    display: flex;
    gap: var(--ros-space-2, 8px);

    input {
      flex: 1;
      min-width: 0;
      padding: var(--ros-space-2, 8px);
      background: var(--rc-recuo);
      color: var(--rc-texto);
      font: inherit;
      font-size: var(--ros-text-md, 14px);
      border: 2px solid var(--rc-linha);
      border-radius: 0;
      // A caixa de perguntar é a única peça com a cor do modelo: é ela que fala
      // com a IA, e o jogador precisa saber quando está gastando isso.
      box-shadow: inset 0 0 0 1px var(--rc-com-modelo);
    }

    button {
      justify-content: center;
      min-height: 30px;
      padding: var(--ros-space-1, 4px) var(--ros-space-3, 12px);
      font-size: var(--ros-text-sm, 12px);

      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
    }
  }

  // ⚠️ O ALDEÃO SEM NADA PARA VENDER AINDA É ALGUÉM. Antes isto era uma frase
  // solta de 12px com 70% de opacidade num painel vazio — o print do founder é
  // exatamente esse retângulo cinza com um `x` e uma linha de texto. Agora a
  // recusa tem a mesma moldura recuada das outras informações do painel.
  &__vazio {
    margin: 0;
    padding: var(--ros-space-3, 12px);
    color: var(--rc-texto-2);
    font-size: var(--ros-text-md, 14px);
    text-align: center;
  }

  &__lista {
    display: grid;
    gap: var(--ros-space-2, 8px);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__linha {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto auto;
    align-items: center;
    gap: var(--ros-space-2, 8px);
    padding: var(--ros-space-2, 8px);
  }

  &__lado {
    display: flex;
    align-items: center;
    gap: var(--ros-space-1, 4px);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 2px;

    img {
      width: 26px;
      height: 26px;
      image-rendering: pixelated;
    }
  }

  &__seta {
    color: var(--rc-texto-3);
  }

  &__botao {
    justify-content: center;
    min-height: 30px;
    padding: var(--ros-space-1, 4px) var(--ros-space-3, 12px);
    font-size: var(--ros-text-sm, 12px);

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  &__estoque {
    font-size: var(--ros-text-sm, 12px);
    color: var(--rc-texto-3);
  }
}
</style>
