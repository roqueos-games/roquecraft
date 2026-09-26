// RoqueCraft — A FALA DO NPC.
//
// ⚠️ UMA PORTA, DUAS IMPLEMENTAÇÕES, E UMA REGRA QUE NÃO SE NEGOCIA.
//
// O founder pediu conversa de verdade e autorizou usar a conexão de LLM do
// RoqueOS. A arquitetura abaixo vem da referência de NPC com LLM levantada no
// plano do Goal 20, e as três decisões que ela impõe são:
//
//  1. **O MODELO SÓ PRODUZ FALA.** Nenhuma mudança de estado do jogo sai dele.
//     Troca, presente e amizade continuam pelos caminhos validados que já
//     existem e já têm teste. Um NPC que pudesse mudar estado seria um NPC que
//     inventa item — e o jogador não teria como reportar isso como defeito.
//  2. **A MEMÓRIA É ESCRITA PELO JOGO, nunca sintetizada da conversa.** O que
//     vai no prompt é o estado de `npc.js`, que só a lógica do jogo altera.
//  3. **O LOCAL É O PADRÃO E É O RECUO.** Sem Modo Servidor, sem chave, com o
//     modelo lento ou fora do ar, o jogador conversa do mesmo jeito. Um jogo que
//     para de responder porque um endpoint demorou não é um jogo.
//
// ⚠️ E A PONTE NÃO É O `assistantAgent`. Aquele é o agente do RoqueOS e ele
// DIRIGE O DESKTOP: liga-se a ele e um aldeão ganha o poder de abrir aplicativo
// do usuário. A camada certa é a de provider do `rosChat`, que é completação
// pura — texto entra, texto sai.

import { humorDe, jaConhece, vezesQue } from './npc.js'

/** Quanto tempo o jogador espera pelo modelo antes de a fala local entrar. */
export const PACIENCIA_MS = 4000

/**
 * As falas locais, por humor e por assunto.
 *
 * ⚠️ ELAS NÃO SÃO O PLANO B TRISTE. São o que roda para a maioria das partidas
 * — offline, no celular, sem servidor — e por isso têm que ser boas sozinhas.
 * O que as salva de virar papagaio é o ESTADO: quem já trocou com você ouve
 * outra coisa de quem nunca trocou, e o desconfiado responde diferente do
 * caloroso. A variedade vem de combinação, não de uma lista comprida.
 */
export const FALAS = Object.freeze({
  saudacao: {
    desconfiado: ['O que você quer?', 'Não compro conversa.', 'Ande logo.'],
    reservado: ['Bom dia.', 'Precisa de quê?', 'Estou trabalhando.'],
    cordial: ['Bom te ver por aqui.', 'Como vai a estrada?', 'Chegou em boa hora.'],
    caloroso: ['Ora, você!', 'Já estava esperando você aparecer.', 'Senta, conta as novidades.'],
  },
  oficio: {
    fazendeiro: 'A terra rende quando chove na hora certa.',
    ferreiro: 'Ferro bom pede carvão bom. Traga carvão.',
    bibliotecario: 'Livro guardado não ensina ninguém.',
    clerigo: 'Tem coisa que não se compra com esmeralda.',
  },
  // ⚠️ O BANCO DA PERGUNTA LIVRE EXISTE PORQUE O MODELO PODE NÃO VIR. Sem ele,
  // perguntar qualquer coisa sem Modo Servidor devolvia uma SAUDAÇÃO — o
  // jogador perguntava "onde fica a mina?" e ouvia "bom dia", o que não lê como
  // fallback, lê como defeito.
  livre: {
    desconfiado: ['Não sei de nada disso.', 'Pergunte a outro.'],
    reservado: ['Não sei dizer.', 'Isso é longe do meu ofício.'],
    cordial: ['Boa pergunta. Fica para a próxima.', 'Disso eu não entendo, mas gosto de ouvir.'],
    caloroso: [
      'Você pergunta cada coisa! Não sei, mas pensa comigo.',
      'Sabe que nunca parei para pensar nisso?',
    ],
  },
  despedida: {
    desconfiado: ['Vá.', 'Já terminamos.'],
    reservado: ['Até.', 'Bom caminho.'],
    cordial: ['Volte quando quiser.', 'Boa jornada.'],
    caloroso: ['Volte logo, viu?', 'A porta fica aberta.'],
  },
})

/** Escolhe de forma estável: o mesmo NPC, no mesmo estado, diz a mesma coisa. */
const escolher = (lista, semente) => lista[Math.abs(semente) % lista.length]

/**
 * A fala LOCAL — determinística, offline, testável.
 *
 * ⚠️ DETERMINÍSTICA DE PROPÓSITO. Fala sorteada a cada quadro faz o NPC mudar de
 * frase enquanto o jogador lê. A semente é o estado: muda quando o estado muda,
 * e só então.
 */
export function falaLocal(npc, assunto = 'saudacao') {
  const humor = humorDe(npc.amizade)
  if (assunto === 'oficio') return FALAS.oficio[npc.profissao] ?? FALAS.oficio.fazendeiro
  const banco = FALAS[assunto]?.[humor] ?? FALAS.saudacao[humor]
  const semente = npc.amizade + npc.memoria.length * 7 + npc.nome.length
  const base = escolher(banco, semente)
  // ⚠️ O RECONHECIMENTO É O QUE FAZ PARECER MEMÓRIA. "Bom dia" de quem já te
  // vendeu doze vezes é a coisa que denuncia máquina de venda com pernas.
  if (assunto === 'saudacao' && jaConhece(npc) && vezesQue(npc, 'trocou') >= 3) {
    return `${base} Sempre bom negociar com você.`
  }
  return base
}

/**
 * O RETRATO que vai no prompt do modelo.
 *
 * ⚠️ DADO ESTRUTURADO, NÃO PROSA. Persona escrita à mão em texto corrido é o
 * que faz o modelo derivar de personagem: ele reescreve o que leu. Aqui vai o
 * estado, e o estado é do jogo.
 *
 * ⚠️ E ELE NÃO CARREGA NADA QUE O NPC NÃO SABERIA. Um ferreiro de aldeia não
 * conhece a semente do mundo nem o inventário do jogador; mandar isso no prompt
 * é convidar o modelo a falar de coisa que o personagem não tem como saber.
 */
export function retratoDoNpc(npc) {
  return {
    nome: npc.nome,
    oficio: npc.profissao,
    humor: humorDe(npc.amizade),
    jaNegociou: vezesQue(npc, 'trocou'),
    foiPresenteado: vezesQue(npc, 'presenteou') > 0,
    foiAgredido: vezesQue(npc, 'bateu') > 0,
  }
}

/** O limite de tamanho da fala, em caracteres. Balão de jogo, não ensaio. */
export const TETO_DA_FALA = 180

/**
 * Limpa o que o modelo devolveu.
 *
 * ⚠️ TUDO QUE VEM DE FORA É DADO, NÃO COMANDO. Modelo que devolve markdown,
 * aspas, prefixo de nome ou um parágrafo de três linhas quebra o balão — e
 * modelo que devolve vazio não pode virar um NPC mudo. Quem não passa aqui cai
 * na fala local, que é o recuo de sempre.
 */
export function limparFala(bruto) {
  if (typeof bruto !== 'string') return null
  // ⚠️ A ORDEM IMPORTA, e a primeira versão errou nela. Tirando as aspas ANTES
  // do prefixo de nome, `**Benedito:** "ferro bom"` vira `"ferro bom` — a aspa
  // do fim já tinha saído e a da frente ficou presa atrás do nome. Marcação
  // primeiro, depois o nome, e só então as aspas que sobraram nas pontas.
  const limpo = bruto
    .replace(/[*_`#>]/g, '')
    .replace(/^\s*\w+\s*:\s*/, '')
    .replace(/^\s*["'«»]+|["'«»]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!limpo) return null
  return limpo.length > TETO_DA_FALA ? `${limpo.slice(0, TETO_DA_FALA - 1).trimEnd()}…` : limpo
}

/**
 * A porta. Devolve SEMPRE uma fala.
 *
 * @param {object} e
 * @param {object} e.npc  o estado de `npc.js`
 * @param {string} [e.assunto]
 * @param {string} [e.pergunta]  o que o jogador escreveu, quando escreveu
 * @param {(retrato, pergunta) => Promise<string>} [e.modelo]  a conexão de LLM
 * @param {number} [e.paciencia]
 * @returns {Promise<{ texto: string, fonte: 'modelo'|'local' }>}
 */
export async function falaDoNpc({
  npc,
  assunto = 'saudacao',
  pergunta = '',
  modelo = null,
  paciencia = PACIENCIA_MS,
}) {
  const local = { texto: falaLocal(npc, assunto), fonte: 'local' }
  if (!modelo) return local
  try {
    // ⚠️ A CORRIDA CONTRA O RELÓGIO É A REGRA 3 EM CÓDIGO. Sem ela, um endpoint
    // que pendura deixa o jogador olhando um balão vazio com o jogo rodando
    // atrás — e ele não tem como saber que o problema é a rede.
    const bruto = await Promise.race([
      modelo(retratoDoNpc(npc), pergunta),
      new Promise((ok) => setTimeout(() => ok(null), paciencia)),
    ])
    const texto = limparFala(bruto)
    return texto ? { texto, fonte: 'modelo' } : local
  } catch {
    // Erro de rede, chave errada, modelo fora do ar: o jogo não para por isso.
    return local
  }
}
