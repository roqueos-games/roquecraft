/**
 * PECUÁRIA — alimentar, procriar, tosquiar. A regra, sem mundo em volta.
 *
 * O rebanho existia como cenário: nascia, andava, morria de machadada. Não dava
 * pra AUMENTAR. Isso deixava o jogo sem o ciclo que faz uma base virar uma base
 * — cercar, alimentar, colher — e transformava carne e lã em recurso finito de
 * mundo, que é o contrário do que o original faz.
 *
 * Isto entra agora porque a rodada 22 passou a GRAVAR o rebanho. Antes dela,
 * criar um casal e voltar no dia seguinte pra um curral vazio teria sido pior
 * que não ter procriação nenhuma.
 *
 * ⚠️ TRIGO PRA TODO MUNDO, e é desvio consciente do original. Lá o porco quer
 * cenoura e a galinha quer semente; aqui não existe nem uma nem outra, e os
 * dois itens precisariam de ícone novo na folha — arte, que está congelada. Um
 * porco que não procria com NADA seria pior que um porco que procria com trigo.
 * Quando o ícone existir, esta tabela é o único lugar a mudar.
 */

/** O que faz cada espécie entrar no clima. */
export const ITEM_DE_AMOR = {
  cow: 'wheat',
  sheep: 'wheat',
  pig: 'wheat',
  chicken: 'wheat',
}

/** Segundos de "no amor" depois de comer. */
export const DURACAO_DO_AMOR = 25

/**
 * Espera até poder procriar de novo.
 *
 * ⚠️ SEM ISTO O CURRAL EXPLODE. Dois bichos alimentados dariam um filhote por
 * segundo enquanto houvesse trigo, o teto de criaturas estouraria e o quadro
 * cairia — num telefone, em poucos segundos. No original são 5 minutos; aqui
 * são 3, porque a sessão de navegador é mais curta e 5 minutos de espera num
 * jogo que se joga por 20 é espera demais.
 */
export const ESPERA_PARA_PROCRIAR = 180

/**
 * Quanto tempo o filhote fica filhote.
 *
 * No original são 20 minutos. Aqui são 4: em 20 o jogador nunca veria crescer, e
 * "o filhote cresce" é a metade do que torna a criação satisfatória.
 */
export const TEMPO_DE_BEBE = 240

/** Distância máxima entre os dois pra virar casal. */
export const DISTANCIA_DE_PROCRIAR = 4

/** Quanta lã sai de uma tosquia, e quanto tempo até crescer de novo. */
export const LA_MINIMA = 1
export const LA_MAXIMA = 3
export const ESPERA_DA_LA = 90

/**
 * Até onde a criatura enxerga a comida na sua mão.
 *
 * ⚠️ ISTO É O QUE FECHA O CICLO DA FAZENDA. Sem seguir quem segura o trigo, o
 * jogador constrói o curral e NÃO TEM COMO PÔR BICHO DENTRO — teria que
 * empurrar vaca a socos por cinquenta blocos. A cerca (rodada 27) e o portão
 * (29) só viram fazenda com esta regra junto.
 */
export const DISTANCIA_DE_SEDUCAO = 10

/**
 * Onde ela para de se aproximar.
 *
 * Sem isto, a criatura entra DENTRO do jogador e fica empurrando: no original
 * ela para a uma distância de conversa, e é essa folga que deixa você andar de
 * costas puxando o rebanho.
 */
export const DISTANCIA_QUE_PARA = 2.2

/**
 * A que velocidade ela TROTA atrás da comida.
 *
 * ⚠️ SEM ISTO O "SEGUIR" É ENFEITE, e a sonda mostrou o número: o jogador anda
 * a 4,7 blocos por segundo e a vaca vagueia a 0,95 — cinco vezes mais devagar.
 * Ela é largada para trás em dois segundos e sai do raio de sedução; na medida,
 * o jogador recuou 8 blocos e a vaca andou 3,4.
 *
 * No original a diferença é de ~1,8× (jogador 4,3, vaca 2,5): você anda, olha
 * pra trás e espera um pouco. Aqui a velocidade de VAGUEIO fica como está — é
 * ela que dá o ritmo tranquilo do rebanho, e o founder aprovou esse ritmo — e
 * só o estado de SEGUIR ganha o trote. É o mesmo padrão da fuga, que já tinha
 * multiplicador próprio.
 *
 * Piso, não multiplicador: assim as quatro espécies trotam no mesmo passo em
 * vez de a galinha (base 1,1) disparar na frente da vaca (0,95).
 */
export const VELOCIDADE_SEGUINDO = 2.6

export const ehBebe = (mob) => (mob?.bebe || 0) > 0
export const estaNoAmor = (mob) => (mob?.amor || 0) > 0

/**
 * Esta criatura aceita este item?
 *
 * ⚠️ FILHOTE NÃO PROCRIA. No original comer acelera o crescimento dele; aqui
 * come e não acontece nada visível, o que seria pior — o jogador gastaria trigo
 * achando que está fazendo alguma coisa. Filhote simplesmente recusa, e o item
 * não é consumido.
 */
export function podeAlimentar(mob, item) {
  if (!mob || ehBebe(mob)) return false
  if (ITEM_DE_AMOR[mob.type] !== item) return false
  if (estaNoAmor(mob)) return false
  return (mob.esperaDeProcriar || 0) <= 0
}

/**
 * Esta criatura segue quem está com este item na mão?
 *
 * ⚠️ NÃO É A MESMA PERGUNTA DE `podeAlimentar`, e a diferença importa. Quem já
 * está no amor, ou esperando pra procriar de novo, CONTINUA seguindo — é assim
 * que você leva o casal inteiro pro curral. Só o filhote não segue: ele segue a
 * mãe, não o trigo.
 */
export function seduzidoPor(mob, itemNaMao) {
  if (!mob || !itemNaMao || ehBebe(mob)) return false
  return ITEM_DE_AMOR[mob.type] === itemNaMao
}

/** Marca a criatura como no amor. Devolve `false` se ela não aceitava. */
export function alimentar(mob, item) {
  if (!podeAlimentar(mob, item)) return false
  mob.amor = DURACAO_DO_AMOR
  // ⚠️ QUEM COMEU DA SUA MÃO É SEU. A partir daqui esta criatura não some mais
  // por distância (ver `shouldDespawn`): ela deixou de ser fauna e virou
  // patrimônio. Sem esta linha, alimentar o rebanho e ir minerar apagaria o
  // rebanho — e a perda seria silenciosa, percebida só na volta.
  mob.domestica = true
  return true
}

/**
 * Acha o primeiro par de criaturas do MESMO tipo, as duas no amor e perto uma
 * da outra.
 *
 * ⚠️ MESMO TIPO. Sem esta checagem, um curral misto daria vaca com galinha e o
 * filhote sairia... de quem? O primeiro da lista. Um defeito que só aparece
 * quando alguém junta duas espécies, e aí parece bruxaria.
 */
export function acharCasal(mobs, distancia = DISTANCIA_DE_PROCRIAR) {
  const lista = (Array.isArray(mobs) ? mobs : []).filter((m) => estaNoAmor(m) && !ehBebe(m))
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i]
      const b = lista[j]
      if (a.type !== b.type) continue
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > distancia) continue
      return [a, b]
    }
  }
  return null
}

/**
 * Consuma o casal e devolva onde o filhote nasce.
 *
 * ⚠️ ZERA O AMOR DOS DOIS ANTES DE QUALQUER OUTRA COISA. Se um deles ficasse no
 * amor, ele formaria casal de novo no mesmo quadro com o próprio filhote assim
 * que ele crescesse — e o curral cresceria sozinho pra sempre.
 */
export function procriar(a, b) {
  a.amor = 0
  b.amor = 0
  a.esperaDeProcriar = ESPERA_PARA_PROCRIAR
  b.esperaDeProcriar = ESPERA_PARA_PROCRIAR
  return {
    type: a.type,
    // O filhote já nasce doméstico: ele é resultado de trabalho, não de spawn.
    domestica: true,
    x: (a.x + b.x) / 2,
    y: Math.max(a.y, b.y),
    z: (a.z + b.z) / 2,
  }
}

/** Só ovelha adulta e não tosquiada, e só com tesoura. */
export function podeTosquiar(mob, ferramenta) {
  if (!mob || mob.type !== 'sheep') return false
  if (ehBebe(mob) || mob.tosquiada) return false
  return ferramenta === 'shears'
}

export function tosquiar(mob, rnd = Math.random) {
  if (!mob) return 0
  mob.tosquiada = true
  mob.esperaDaLa = ESPERA_DA_LA
  return LA_MINIMA + Math.floor(rnd() * (LA_MAXIMA - LA_MINIMA + 1))
}

/**
 * Um passo dos relógios da pecuária. Devolve os eventos do passo.
 *
 * Fica separado de `stepMob` de propósito: `stepMob` já é a maior função do
 * módulo e isto não tem nada a ver com IA, colisão nem perseguição.
 */
export function passoDaPecuaria(mob, dt) {
  const eventos = []
  if (!mob) return eventos
  if (mob.amor > 0) mob.amor = Math.max(0, mob.amor - dt)
  if (mob.esperaDeProcriar > 0) mob.esperaDeProcriar = Math.max(0, mob.esperaDeProcriar - dt)
  if (mob.bebe > 0) {
    mob.bebe = Math.max(0, mob.bebe - dt)
    if (mob.bebe === 0) eventos.push('cresceu')
  }
  if (mob.esperaDaLa > 0) {
    mob.esperaDaLa = Math.max(0, mob.esperaDaLa - dt)
    if (mob.esperaDaLa === 0 && mob.tosquiada) {
      mob.tosquiada = false
      eventos.push('laCresceu')
    }
  }
  return eventos
}
