// RoqueCraft - onde a LAJE encaixa.
//
// Separado de `construcao.js` de propósito: aquele módulo é sobre CADÊNCIA (o
// botão segurado, o intervalo, a célula já usada) e este é sobre GEOMETRIA DE
// ENCAIXE. São duas perguntas que mudam por motivos diferentes — a cadência
// muda quando a ergonomia muda, o encaixe muda quando entra uma forma nova
// (escada, degrau, cerca) — e misturá-las faria a próxima forma reabrir um
// arquivo que não tem nada a ver com ela.
//
// Puro: recebe números e chaves, devolve onde e o quê. Sem mundo, sem Vue.

import { BLOCKS, BLOCK_BY_KEY, LAJE_DO_BLOCO, BLOCO_DA_LAJE } from './blocks.js'
import { alturaNaCelula } from './voxelRaycast.js'

/** A metade que este id ocupa: 'base', 'topo', ou null se não for laje. */
export function metadeDaLaje(id) {
  const key = BLOCKS[id]?.key
  if (!key || !BLOCO_DA_LAJE[key]) return null
  return key.endsWith('Topo') ? 'topo' : 'base'
}

/** O material do bloco cheio correspondente ('stoneSlab' → 'stone'). */
export const materialDaLaje = (id) => BLOCO_DA_LAJE[BLOCKS[id]?.key] || null

/** O item é uma laje? (só a metade de baixo vira item — ver `semItem`) */
export const ehItemDeLaje = (item) => !!BLOCO_DA_LAJE[item]

/**
 * ONDE A LAJE ENCAIXA.
 *
 * Devolve `{ x, y, z, id, dupla }` — a célula que recebe, o bloco que entra, e
 * se aquilo foi uma FUSÃO (duas metades virando bloco cheio) — ou `null` se o
 * item não é laje e o chamador deve seguir pelo caminho normal.
 *
 * As três regras, na ordem do jogo de referência:
 *
 *  1. **Laje dupla.** Mirou na metade VAZIA de uma laje do mesmo material? As
 *     duas viram o bloco cheio, NA CÉLULA DA LAJE — não na vizinha. É a regra
 *     que faz a laje parecer material de construção em vez de decoração: dá pra
 *     preencher um degrau sem quebrar nada.
 *  2. **Face de cima** manda a metade de baixo; **face de baixo** manda a de
 *     cima. É o encaixe "onde eu cliquei é onde ela se apoia".
 *  3. **Face lateral** decide pela ALTURA DO CLIQUE dentro da face. Clicou na
 *     parte de cima do tijolo, a laje nasce em cima.
 *
 * ⚠️ A ordem importa e não é arbitrária: a face vem ANTES da altura do clique
 * porque numa face horizontal o ponto de impacto cai exatamente no plano
 * inteiro da célula (fração 0 ou 1), e ler a altura ali responderia sempre a
 * mesma coisa — a laje sairia sempre na mesma metade, e o jogador não teria
 * como pedir a outra.
 *
 * `face` na ordem canônica do mesher: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z.
 */
export function encaixarLaje({ item, alvoId, alvo, face, pontoY, destino }) {
  const material = BLOCO_DA_LAJE[item]
  if (!material) return null
  const par = LAJE_DO_BLOCO[material]
  if (!par) return null

  // Regra 1 — fusão. Só vale com a MESMA laje: encostar carvalho em pedra tem
  // que continuar sendo duas peças, senão o jogador perde material sem entender.
  if (materialDaLaje(alvoId) === material) {
    const metade = metadeDaLaje(alvoId)
    const pedindoOTopo = face === 2 || (face !== 3 && alturaNaCelula(pontoY) > 0.5)
    const pedindoABase = face === 3 || (face !== 2 && alturaNaCelula(pontoY) <= 0.5)
    if ((metade === 'base' && pedindoOTopo) || (metade === 'topo' && pedindoABase)) {
      return { ...alvo, id: BLOCK_BY_KEY[material].id, dupla: true }
    }
  }

  // Regras 2 e 3 — célula vizinha.
  const metade =
    face === 2 ? 'base' : face === 3 ? 'topo' : alturaNaCelula(pontoY) > 0.5 ? 'topo' : 'base'
  return { ...destino, id: BLOCK_BY_KEY[par[metade]].id, dupla: false }
}
