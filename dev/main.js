// O RoqueCraft rodando sozinho, com o host de desenvolvimento do SDK: localStorage no lugar
// da conta, console no lugar do analytics. É o mesmo `mount` que o RoqueOS chama.
import { criarHostDeDesenvolvimento } from '@roqueos-games/jogo-sdk/host-de-desenvolvimento'
import jogo from '../src/index.js'

const host = criarHostDeDesenvolvimento({ jogoId: jogo.id })
const montagem = jogo.mount(document.getElementById('jogo'), host, { ativo: true })

// Trocar de aba ou de janela é o equivalente a perder o foco no RoqueOS.
window.addEventListener('focus', () => montagem.ativar(true))
window.addEventListener('blur', () => montagem.ativar(false))
