// A porta de entrada do RoqueCraft: o jogo como o jogo-sdk entende um jogo.
//
// `montar` recebe o elemento, o host e se a janela está ativa, cria um app Vue
// próprio dentro do elemento e devolve `{ ativar, desmontar }`. O app é
// próprio, e não um componente dentro do app do RoqueOS, porque é assim que o
// jogo roda igual nos três lugares: no RoqueOS, sozinho no `yarn dev` do repo
// e no teste. Nenhuma store, nenhum plugin e nenhum estilo global do RoqueOS
// chega aqui dentro; o que o jogo precisa vem pelo `host`.

import { createApp, reactive } from 'vue'
import { definirJogo } from '@roqueos-games/jogo-sdk'
import JogoRoqueCraft from './JogoRoqueCraft.vue'
import { carregarTextos } from './textos.js'

export default definirJogo({
  id: 'roquecraft',
  // A sala em tempo real e o mundo salvo na conta são o jogo: sem eles o host
  // não serve, e a montagem recusa com o que falta. `teclado` e `ia` o jogo usa
  // SE o host tiver (o de desenvolvimento não tem IA, e o RoqueOS de antes da
  // Onda 4 não tinha nenhuma das duas): exigir derrubaria o jogo onde ele
  // funciona sem elas, com o aldeão na fala local.
  capacidades: ['salaAoVivo', 'progresso'],
  montar(el, host, { ativo }) {
    const estado = reactive({ ativo, idioma: host.idioma.atual(), textos: null })
    let app = null
    let desmontado = false
    // Duas trocas de idioma seguidas podem voltar fora de ordem; vale a última.
    let pedido = 0

    const trocarIdioma = async (idioma) => {
      const meu = ++pedido
      const textos = await carregarTextos(idioma)
      if (desmontado || meu !== pedido) return
      estado.idioma = idioma
      estado.textos = textos
    }
    const pararIdioma = host.idioma.aoMudar((novo) => {
      trocarIdioma(novo).catch((erro) => console.error('[RoqueCraft] textos do idioma', novo, erro))
    })

    // O app só monta com o texto na mão: montar antes mostraria a tela
    // inicial sem rótulo por um instante.
    trocarIdioma(estado.idioma)
      .catch((erro) => console.error('[RoqueCraft] textos do idioma', estado.idioma, erro))
      .finally(() => {
        if (desmontado) return
        app = createApp(JogoRoqueCraft, { host, estado })
        app.mount(el)
      })

    return {
      ativar(sim) {
        estado.ativo = sim
      },
      desmontar() {
        desmontado = true
        pararIdioma?.()
        app?.unmount()
        app = null
      },
    }
  },
})
