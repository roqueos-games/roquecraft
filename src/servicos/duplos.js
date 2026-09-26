// RoqueCraft — OS BLOCOS DE DUAS CÉLULAS: cama e porta.
//
// Puro. É a única pergunta que o componente faz sobre os dois ao quebrar um
// bloco: "qual é a outra metade?". A cama sabe da cama (`cama.js`), a porta
// sabe da porta (`porta.js`); aqui só se escolhe quem responde.
//
// ⚠️ A METADE ÓRFÃ É UM OBJETO MEIO VIVO. Quebrar uma metade e deixar a outra
// deixaria uma prancha no chão que ainda responde a "dormir" e ainda grava
// ponto de renascimento — ou uma tábua no ar que ainda responde a "abrir". O
// jogador não tem como entender isso. E a órfã não dropa nada: a peça já saiu
// com a primeira metade.
import { outraMetade } from './cama.js'
import { outraMetadeDaPorta } from './porta.js'

/** A outra metade de uma cama ou porta em (x,y,z), ou `null`. */
export function metadeGemea(id, x, y, z, blocoEm) {
  return outraMetade(id, x, y, z, blocoEm) || outraMetadeDaPorta(id, x, y, z, blocoEm)
}
