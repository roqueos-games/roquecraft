<template>
  <div class="rc-mini" :class="{ 'rc-mini--mobile': mobile }">
    <button
      v-if="aberto"
      class="rc-mini__disco"
      :title="t('roqueCraft.minimapa.esconder')"
      :aria-label="t('roqueCraft.minimapa.titulo')"
      @click="alternar"
    >
      <canvas ref="tela" class="rc-mini__tela" :width="lado" :height="lado" />
    </button>
    <button
      v-else
      class="rc-mini__botao"
      :title="t('roqueCraft.minimapa.mostrar')"
      :aria-label="t('roqueCraft.minimapa.mostrar')"
      @click="alternar"
    >
      <RCIcon nome="bussola" :size="mobile ? 18 : 14" />
    </button>
  </div>
</template>

<script setup>
// O MINIMAPA NA TELA. A conta mora em `services/roquecraft/minimapa.js`; aqui
// fica só o que é DOM: o canvas, o relógio do redesenho e os dois caches.
//
// ⚠️ ELE NÃO REDESENHA POR QUADRO, e também não depende da reatividade do Vue
// para andar. São duas decisões opostas com o mesmo dono:
//
//  · Desenhar a 60 Hz gastaria orçamento de quadro do render para mexer um
//    mapa que anda devagar. O relógio próprio a ~9 Hz resolve.
//  · Ler a posição pelo ref reativo do painel prenderia o mapa aos 4 Hz dele
//    (ver a nota das duas cadências em `useRoqueCraftPainel.js`), e a 4 Hz um
//    mapa PULA. Por isso o painel escreve um espelho NÃO REATIVO por quadro, e
//    é dele que este componente lê.
//
// ⚠️ E O TRABALHO NOVO É RACIONADO: no máximo UMA peça de terreno amostrada por
// tique (~2 ms, medido em 14/09/2026). Sem o racionamento, abrir o mapa num
// lugar novo amostraria 25 peças de uma vez — 50 ms, três quadros perdidos e um
// engasgo que o jogador lê como "o jogo travou ao abrir o mapa".

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTextos } from '../textosDoJogo.js'
import { DIMENSAO_PADRAO } from '../servicos/constants.js'
import RCIcon from './RCIcon.vue'
import {
  BLOCOS_DA_PECA,
  BLOCOS_POR_PIXEL,
  COR_DA_MARCA,
  COR_DO_CONTORNO,
  COR_DO_JOGADOR,
  COR_DO_VAZIO,
  LADO_DA_PECA,
  MARCAS_DESENHADAS,
  campoDaPeca,
  cantoDaPeca,
  distanciaCurta,
  emCss,
  marcasDoMinimapa,
  mundoDoMinimapa,
  pintarPeca,
  projetar,
} from '../servicos/minimapa.js'

const props = defineProps({
  /**
   * `playerPos` do painel.
   *
   * ⚠️ A SEMENTE E A DIMENSÃO VÊM POR AQUI, dentro de `pos.vivo`, e não como
   * prop própria. Não é economia de assinatura: quem escreve `vivo` lê os dois
   * do CLIENTE DO MUNDO a cada atualização do painel, e o cliente é o único que
   * sabe que houve um `reset`. Uma prop `:seed` presa ao ref do componente
   * continuaria valendo a semente com que o jogo abriu — e o mapa desenharia,
   * com toda a precisão, o mundo anterior.
   */
  pos: { type: Object, required: true },
  mobile: { type: Boolean, default: false },
})

/**
 * ⚠️ `v-model`, E NÃO UM OBJETO DE AJUSTES MUTADO AQUI DENTRO.
 *
 * A primeira versão recebia `settings` inteiro e escrevia `ajustes.minimapa` no
 * clique. Funcionava, cabia no orçamento de linhas do `ROSRoqueCraft.vue` — e
 * `vue/no-mutating-props` reprovou, com razão: filho que escreve no objeto do
 * pai faz o estado ter dois donos e nenhum responsável. O `v-model` sobe o
 * `settings.minimapa` por dois níveis sem que ninguém mute prop de ninguém, e
 * termina no MESMO campo em que a tecla M escreve — que é o que impede "apertei
 * M e não aconteceu nada" depois de esconder o mapa pelo toque.
 *
 * Sem `default`: ausência é LIGADO (mesma regra de `ajustes.js`, e save antigo
 * não tem o campo), e um `default: true` aqui deixaria pai e filho fora de
 * sincronia enquanto o pai ainda vale `undefined`.
 */
const minimapa = defineModel('minimapa', { type: Boolean, required: false })

const t = useTextos()

const aberto = computed(() => minimapa.value !== false)
const alternar = () => {
  minimapa.value = !aberto.value
}

/** Milissegundos entre dois desenhos. ~9 Hz: anda liso e não pesa. */
const PASSO_DO_DESENHO = 110
/** Quanto o jogador anda antes de o mapa reprocurar estrutura, em blocos. */
const PASSO_DA_BUSCA = 48
/** Teto dos dois caches. Acima disto, esvazia: sessão longa não vira vazamento. */
const TETO_DAS_PECAS = 220
const TETO_DAS_CELULAS = 4000

const tela = ref(null)
const lado = computed(() => (props.mobile ? 108 : 132))

let mundo = null
let pecas = new Map()
let celulas = new Map()
let marcas = []
let buscadoEm = null
let relogio = null

/** A pose viva do painel, com recuo no ref reativo quando ela não existe. */
const pose = () => props.pos?.vivo ?? props.pos

/** A semente que o mapa desenhou por último. `reset` faz ela divergir. */
let sementeDesenhada = null

function recomecar(semente) {
  sementeDesenhada = semente
  mundo = mundoDoMinimapa(semente ?? 1)
  pecas = new Map()
  celulas = new Map()
  marcas = []
  buscadoEm = null
}

/**
 * ⚠️ O CACHE DE CÉLULA GUARDA O RESUMO, E NÃO O PLANO. Um plano de aldeia leva
 * nove casas, postes e roças; quatro mil deles na memória de uma sessão longa
 * são megabytes de objeto que só existem para o mapa ler dois números.
 */
const lembrar = (prefixo, achar) => (cx, cz) => {
  const k = `${prefixo}${cx},${cz}`
  if (!celulas.has(k)) {
    const p = achar(cx, cz)
    celulas.set(k, p ? { centro: { x: p.centro.x, z: p.centro.z }, ruina: !!p.ruina } : null)
  }
  return celulas.get(k)
}

function procurar(centro) {
  if (celulas.size > TETO_DAS_CELULAS) celulas = new Map()
  marcas = marcasDoMinimapa({
    vilaEm: lembrar('v', mundo.vilaEm),
    casteloEm: lembrar('c', mundo.casteloEm),
    centro,
  })
  buscadoEm = { x: centro.x, z: centro.z }
}

/** Amostra UMA peça que falta, a mais perto do centro. Devolve se trabalhou. */
function gerarUmaPeca(centro, raio) {
  const meio = raio * BLOCOS_POR_PIXEL
  let alvo = null
  let melhor = Infinity
  for (let bz = cantoDaPeca(centro.z - meio); bz <= centro.z + meio; bz += BLOCOS_DA_PECA) {
    for (let bx = cantoDaPeca(centro.x - meio); bx <= centro.x + meio; bx += BLOCOS_DA_PECA) {
      if (pecas.has(`${bx},${bz}`)) continue
      const d = Math.hypot(bx + BLOCOS_DA_PECA / 2 - centro.x, bz + BLOCOS_DA_PECA / 2 - centro.z)
      if (d < melhor) {
        melhor = d
        alvo = [bx, bz]
      }
    }
  }
  if (!alvo) return false
  if (pecas.size > TETO_DAS_PECAS) pecas = new Map()
  const [bx, bz] = alvo
  const cv = document.createElement('canvas')
  cv.width = LADO_DA_PECA
  cv.height = LADO_DA_PECA
  const rgba = pintarPeca(campoDaPeca(mundo, bx, bz), mundo.nivelDoMar)
  cv.getContext('2d').putImageData(new ImageData(rgba, LADO_DA_PECA, LADO_DA_PECA), 0, 0)
  pecas.set(`${bx},${bz}`, cv)
  return true
}

function desenharMarca(ctx, m, centro, raio) {
  const { px, pz, fora } = projetar(m, centro, raio)
  const x = raio + px
  const y = raio + pz
  ctx.fillStyle = emCss(COR_DA_MARCA[m.tipo] ?? COR_DA_MARCA.vila)
  ctx.strokeStyle = COR_DO_CONTORNO
  ctx.lineWidth = 1
  if (fora) {
    // Presa na borda: vira SETA, porque a posição já não é a verdade. E leva a
    // distância escrita, que é a informação que a seta perdeu.
    const a = Math.atan2(pz, px)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(4, 0)
    ctx.lineTo(-3, -3.2)
    ctx.lineTo(-3, 3.2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    ctx.font = '8px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const rotulo = distanciaCurta(m.distancia)
    const rx = raio + px * 0.82
    const ry = raio + pz * 0.82
    ctx.strokeStyle = COR_DO_CONTORNO
    ctx.lineWidth = 2.5
    ctx.strokeText(rotulo, rx, ry)
    ctx.fillText(rotulo, rx, ry)
    return
  }
  ctx.beginPath()
  ctx.rect(x - 2.5, y - 2.5, 5, 5)
  ctx.fill()
  ctx.stroke()
}

function desenhar() {
  const cv = tela.value
  if (!cv) return
  const p = pose()
  // ⚠️ TROCOU O MUNDO, JOGA O CACHE FORA. Sem isto, voltar de um `reset` (mundo
  // novo, ou o save de outra semente) deixaria o mapa mostrando peças do mundo
  // anterior até o jogador andar 64 blocos — e elas nunca sairiam do centro.
  if (!mundo || p.semente !== sementeDesenhada) recomecar(p.semente)
  const ctx = cv.getContext('2d')
  const n = cv.width
  const raio = n / 2
  const centro = { x: p.x, z: p.z }
  // ⚠️ FORA DO SUPERMUNDO O MAPA NÃO SABE NADA. O relevo, o bioma e a vila saem
  // do gerador do supermundo; desenhá-los no Nether daria um mapa perfeitamente
  // legível de um lugar que não é onde o jogador está. Resta a seta — que ainda
  // é verdade, porque a coordenada é a mesma.
  const noSupermundo = !p.dimensao || p.dimensao === DIMENSAO_PADRAO

  ctx.clearRect(0, 0, n, n)
  ctx.imageSmoothingEnabled = false
  ctx.save()
  ctx.beginPath()
  ctx.arc(raio, raio, raio, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = COR_DO_VAZIO
  ctx.fillRect(0, 0, n, n)

  // ⚠️ O PORTÃO DA DIMENSÃO COBRE O DESENHO, E NÃO SÓ A GERAÇÃO.
  //
  // A primeira versão barrava `procurar` e `gerarUmaPeca` no Nether e deixava o
  // laço do `drawImage` passar. O cache não esvazia ao trocar de dimensão — e o
  // Nether vive em coordenada dividida por oito, bem dentro do quadrado que o
  // jogador acabou de percorrer no supermundo. Resultado: um mapa de supermundo
  // perfeitamente legível, desenhado por cima do Nether, com a seta do jogador
  // andando nele. O comentário acima prometia o contrário do que o código fazia,
  // e o revisor leu o comentário.
  if (noSupermundo) {
    if (!buscadoEm || Math.hypot(p.x - buscadoEm.x, p.z - buscadoEm.z) > PASSO_DA_BUSCA) {
      procurar(centro)
    }
    gerarUmaPeca(centro, raio)

    // ⚠️ O DESLOCAMENTO É ARREDONDADO UMA VEZ SÓ, e não por peça. Arredondando
    // por peça, duas vizinhas caem em pixels diferentes conforme a fração da
    // posição e o mapa ganha costura de 1 px que pisca enquanto o jogador anda.
    const ox = Math.round(raio - p.x / BLOCOS_POR_PIXEL)
    const oz = Math.round(raio - p.z / BLOCOS_POR_PIXEL)
    const meio = raio * BLOCOS_POR_PIXEL
    for (let bz = cantoDaPeca(p.z - meio); bz <= p.z + meio; bz += BLOCOS_DA_PECA) {
      for (let bx = cantoDaPeca(p.x - meio); bx <= p.x + meio; bx += BLOCOS_DA_PECA) {
        const peca = pecas.get(`${bx},${bz}`)
        if (peca) ctx.drawImage(peca, ox + bx / BLOCOS_POR_PIXEL, oz + bz / BLOCOS_POR_PIXEL)
      }
    }
  }
  ctx.restore()

  if (noSupermundo) {
    for (const m of marcas.slice(0, MARCAS_DESENHADAS)) desenharMarca(ctx, m, centro, raio)
  }

  // O jogador por último: nada pode cobri-lo. A ponta segue o yaw, e o mapa é
  // NORTE PARA CIMA — girar o mapa custaria a única referência estável que ele
  // tem para dizer "a vila fica ao norte".
  const yaw = p.yaw ?? 0
  ctx.save()
  ctx.translate(raio, raio)
  ctx.rotate(yaw)
  ctx.beginPath()
  ctx.moveTo(0, -5)
  ctx.lineTo(3.4, 4)
  ctx.lineTo(0, 2)
  ctx.lineTo(-3.4, 4)
  ctx.closePath()
  ctx.fillStyle = COR_DO_JOGADOR
  ctx.strokeStyle = COR_DO_CONTORNO
  ctx.lineWidth = 1
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

watch(aberto, (v) => v && desenhar())

onMounted(() => {
  relogio = setInterval(() => {
    if (aberto.value) desenhar()
  }, PASSO_DO_DESENHO)
  desenhar()
})

onBeforeUnmount(() => {
  clearInterval(relogio)
  relogio = null
})
</script>

<style lang="scss" scoped>
.rc-mini {
  --rc-mini-borda: rgba(12, 12, 14, 0.75);
  --rc-mini-fundo: rgba(22, 22, 26, 0.82);
  position: absolute;
  top: calc(var(--ros-space-3, 12px) + env(safe-area-inset-top));
  right: calc(var(--ros-space-3, 12px) + env(safe-area-inset-right));
  pointer-events: auto;

  // No celular os três botões de 44 px do `RCMobile` já ocupam este canto. O
  // mapa desce abaixo deles em vez de disputar o mesmo pixel.
  &--mobile {
    top: calc(
      var(--ros-space-3, 12px) + env(safe-area-inset-top) + var(--rc-toque) +
        var(--ros-space-2, 8px)
    );
  }

  &__disco,
  &__botao {
    display: block;
    padding: 0;
    cursor: pointer;
    background: var(--rc-mini-fundo);
    border: 2px solid var(--rc-linha);
    box-shadow:
      inset 0 2px 0 var(--rc-luz),
      inset 0 -2px 0 var(--rc-sombra),
      0 2px 8px var(--rc-mini-borda);
    color: var(--rc-texto);
  }

  &__disco {
    border-radius: 50%;
    overflow: hidden;
    line-height: 0;
  }

  &__tela {
    display: block;
    image-rendering: pixelated;
  }

  &__botao {
    width: 28px;
    height: 28px;
    border-radius: 0;
    display: grid;
    place-items: center;
  }

  &--mobile &__botao {
    width: var(--rc-toque);
    height: var(--rc-toque);
  }
}
</style>
