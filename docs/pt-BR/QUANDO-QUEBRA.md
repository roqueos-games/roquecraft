# Quando quebra

_[English](../WHEN-IT-BREAKS.md) | Português_

> **Para quem:** quem tem gate vermelho, jogo que não abre, mundo que não grava ou sala que não conecta.
> **O que tem aqui:** um primeiro comando de diagnóstico e, por área, a tabela do que aparece, da causa e do que fazer, com a mensagem literal. Falha que já aconteceu leva a data.
> **Onde ir para o resto:** o que cada suíte prova em [TESTES.md](TESTES.md); a rotina que mantém o gate verde em [OPERACAO.md](OPERACAO.md).

As mensagens estão citadas como o programa as imprime: em português quando o programa escreve em
português, em inglês quando é o texto do jogo em inglês ou do Vitest. Mensagem do console começa com
`[RoqueCraft]`.

## Sumário

1. [Primeiro diagnóstico](#1-primeiro-diagnóstico)
2. [Instalar](#2-instalar)
3. [O gate](#3-o-gate)
4. [O jogo no navegador](#4-o-jogo-no-navegador)
5. [Save](#5-save)
6. [Sala](#6-sala)
7. [Sondas de QA](#7-sondas-de-qa)

## 1. Primeiro diagnóstico

```bash
yarn lint; yarn format:check; yarn jogo:check; yarn test 2>&1 | grep -E "FAIL|AssertionError" | head -20
```

Rodar os quatro passos separados mostra qual deles falha; o `yarn verificar` para no primeiro. No
navegador, abra o console e filtre por `[RoqueCraft]`.

## 2. Instalar

| O que aparece                                                                               | Causa                                               | O que fazer                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| o yarn falha ao buscar o `jogo-sdk`                                                         | o SDK vem de `github:roqueos-games/jogo-sdk#v0.3.0` | confira o acesso ao GitHub; o repo é público             |
| `package.json declara "<script>", que roda sozinho no install de quem depende deste pacote` | entrou um script de instalação no `package.json`    | tire; o RoqueOS instala o jogo e nada pode rodar sozinho |
| erro de versão do `node`                                                                    | Node abaixo do 22                                   | use a versão do `.nvmrc` (24)                            |

## 3. O gate

| O que aparece                                                                                                               | Causa                                                                                                                                                           | O que fazer                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `a última varredura foi há 50 dias (folga: 21). Rode node qa/qa-sondas.mjs — leva ~1 h.`                                    | a varredura do repo é de 30/09/2026; vermelha desde 21/10/2026, vista em 18/11/2026                                                                             | `node qa/lib/preparar-dist.mjs`, depois `node qa/qa-sondas.mjs`, e commit do JSON |
| `a última medição foi há 50 dias (folga: 21). Rode node qa/bench-mesher.mjs --ledger`                                       | o ledger do mesher é de 30/09/2026; visto em 18/11/2026                                                                                                         | `node qa/bench-mesher.mjs --ledger` e commit do `qa/bench-mesher.json`            |
| `expected 54.30237100000022 to be less than 40` no `perf.spec.js` (`malha um chunk inteiro em tempo de frame`)              | teto de relógio de parede numa máquina mais lenta ou ocupada; visto em 18/11/2026 num contêiner Linux, com o teto de 14 ms da geração de chunk reprovando junto | rode sozinho numa máquina quieta; nunca afrouxe o teto para passar                |
| `i18n/<idioma>.json sem: <chaves>`                                                                                          | chave de texto que entrou em alguns idiomas e não nos dez                                                                                                       | ponha a chave em todos os `i18n/*.json`                                           |
| `<arquivo> sem linha no ASSETS.md (caminho \| licença \| origem)`                                                           | arquivo novo em `public/` sem linha no `ASSETS.md`                                                                                                              | ponha a linha com licença e origem                                                |
| `<arquivo>:<linha> importa "firebase": o jogo não fala com banco, quem fala é o host (salaAoVivo, progresso, placar, sala)` | código de `src/` importa o Firebase                                                                                                                             | passe pela `salaAoVivo` ou pelo `progresso`                                       |
| `Code style issues found` do Prettier                                                                                       | arquivo formatado mudado à mão                                                                                                                                  | `yarn format`, fora de `src/servicos/render/`, que é ignorado                     |
| um teste `it.fails` contado como reprovado                                                                                  | o defeito que ele pina foi consertado                                                                                                                           | troque `it.fails` por `it` no mesmo commit do conserto                            |

## 4. O jogo no navegador

| O que aparece                                                                                                   | Causa                                                             | O que fazer                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| "Não deu para iniciar o RoqueCraft" com "Tentar de novo"; no console `[RoqueCraft] init falhou:`                | o motor não subiu, em geral sem contexto WebGL                    | tente outro navegador ou feche outras abas 3D, depois "Tentar de novo"                  |
| "A placa de vídeo interrompeu o jogo. Feche outras janelas 3D e tente de novo."                                 | o contexto WebGL foi perdido                                      | feche outras janelas 3D e tente de novo                                                 |
| "Não deu para trocar a qualidade"; no console `[RoqueCraft] troca de qualidade falhou:`                         | o motor não renasceu com o perfil novo                            | volte à qualidade anterior; reporte com a saída do console                              |
| no console `[RoqueCraft] sem Web Worker, modo inline:` ou `[RoqueCraft] worker falhou, caindo pro modo inline:` | o Worker não subiu (navegador antigo, CSP, teste)                 | o jogo segue, mais lento para carregar; confira que o padrão da URL do Worker não mudou |
| `[roquecraft] host não cumpre o contrato: ...`                                                                  | falta `salaAoVivo` ou `progresso` no host, ou a forma está errada | conserte o host; a lista depois dos dois-pontos diz o que falta                         |
| a janela não abre e o console mostra `TypeError: "<shader>" is not a function`                                  | crase dentro de uma template string de GLSL, 19/08/2026           | veja o [`dev-docs/roquecraft-v2.md`](../dev-docs/roquecraft-v2.md)                      |
| o mundo não aparece e os draw calls seguem contando                                                             | erro de compilação de GLSL não derruba a página, 19/08/2026       | procure `Shader Error` ou `not compiled` no console                                     |

## 5. Save

| O que aparece                                                                                                                          | Causa                                                                          | O que fazer                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| aviso fixo "Não deu para ler seu mundo salvo. Ele continua guardado — o jogo não vai gravar por cima. Recarregue para tentar de novo." | o host rejeitou o `progresso.carregar()` (RC-02)                               | recarregue; o mundo salvo está intacto e nada foi gravado por cima                                                       |
| no console `[RoqueCraft] falha ao salvar:` com `o host recusou o save do RoqueCraft (veja o aviso do host no console)`                 | o host recusou o `salvar`                                                      | leia o aviso do host no console                                                                                          |
| `Nested arrays are not supported` do Firestore                                                                                         | save com lista dentro de lista; o formato v12, consertado na v13 em 30/09/2026 | confira que o payload passa pelo `semListaDentroDeLista` ([`documentoDoSave.js`](../../src/servicos/documentoDoSave.js)) |
| o mundo não grava dentro de uma sala                                                                                                   | de propósito: o mundo é do anfitrião da sala                                   | nada; volta a gravar fora da sala                                                                                        |
| o mundo não grava no `yarn dev` em modo E2E                                                                                            | de propósito: E2E nunca grava                                                  | nada                                                                                                                     |

## 6. Sala

| O que aparece                                                                                 | Causa                                                  | O que fazer                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| "Entre na sua conta para jogar online com amigos."                                            | sem conta: o host recusou com `sem-conta`              | entre na conta no RoqueOS                                         |
| "Sala não encontrada. Confira o código."                                                      | o código não bate com sala nenhuma                     | confira o código                                                  |
| "Não foi possível conectar. Tente de novo."; no console `[RoqueCraft] entrar na sala falhou:` | a entrada falhou no host                               | tente de novo; leia o erro depois dos dois-pontos                 |
| no console `[RoqueCraft] criar sala falhou:` com `a semeadura de <code> foi recusada`         | o host recusou um lote das edições semeadas            | confira as regras da sala do host para `blocks`                   |
| o anfitrião saiu e ninguém virou anfitrião                                                    | limite conhecido: a presença fica quando a conexão cai | nenhum ainda; pinado por `it.fails` no `salaComHostFalso.spec.js` |
| no `yarn dev`, a segunda aba é o mesmo jogador                                                | a aba foi duplicada                                    | abra o link do convite numa aba nova                              |

## 7. Sondas de QA

| O que aparece                                                         | Causa                                                         | O que fazer                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| a sonda espera para sempre pelo `window.__rosStore`                   | o `dist/pwa` não foi preparado a partir deste repo            | rode antes o `node qa/lib/preparar-dist.mjs`           |
| `qa-roquecraft-cachoeira`, `-ceu`, `-malha`, `-mobs` falham no import | leem o motor pelo caminho do front `src/services/roquecraft/` | conhecido; veja o [`qa/README.md`](../../qa/README.md) |
| `qa-roquecraft-prod` e `-prod-mobile` medem outra coisa               | miram o RoqueOS publicado                                     | esperado                                               |
| uma sonda marcada `nao-rodou`                                         | o navegador que ela pede não está instalado                   | instale o navegador do Playwright que a varredura cita |
