// O RoqueCraft rodando sozinho, com o host de desenvolvimento do SDK: localStorage no lugar
// da conta, console no lugar do analytics. É o mesmo `mount` que o RoqueOS chama.
import { criarHostDeDesenvolvimento } from '@roqueos-games/jogo-sdk/host-de-desenvolvimento'
import jogo from '../src/index.js'

const base = criarHostDeDesenvolvimento({ jogoId: jogo.id })

// A BANDEJA DAS SONDAS. No RoqueOS o aviso vai para `__rosStore.notifications`,
// e cinco sondas contam avisos lá ("o dragão caiu", "não consegui ler o mundo").
// O host de desenvolvimento avisa no console, e as sondas contra este repo
// (`qa/lib/preparar-dist.mjs`) montam um `__rosStore` de mentira com a bandeja
// vazia: sem isto, a sonda do dragão ficava vermelha por não ter o que contar.
// Fora das sondas não há `__rosStore`, e o aviso segue só para o console.
const host = {
  ...base,
  avisar: (mensagem, opcoes) => {
    base.avisar(mensagem, opcoes)
    window.__rosStore?.notifications?.push({ message: mensagem, type: opcoes?.tipo ?? 'info' })
  },
}
const montagem = jogo.mount(document.getElementById('jogo'), host, { ativo: true })

// Trocar de aba ou de janela é o equivalente a perder o foco no RoqueOS.
window.addEventListener('focus', () => montagem.ativar(true))
window.addEventListener('blur', () => montagem.ativar(false))
