# Changelog

## 0.1.0 (25/09/2026)

O RoqueCraft sai do RoqueOS e fala com ele só pelo `jogo-sdk` 0.3.0.

- O componente `ROSRoqueCraft.vue` virou `src/JogoRoqueCraft.vue`, montado por `definirJogo`,
  com as capacidades `salaAoVivo` e `progresso`; `teclado` e `ia` são usadas quando o host as
  tem. O que vinha das stores e dos serviços do RoqueOS chega pelo `host`: a conta, os avisos,
  o perfil leve (`desempenho.modoLeve`, no lugar do atributo `data-low-end` do `<html>`), o
  idioma, o teclado e o modelo de linguagem do aldeão. O laço do quadro, a ordem de montagem dos
  composables e o gancho `window.__roquecraft` ficam como eram.
- O motor (147 arquivos de `src/services/roquecraft/`) veio para `src/servicos/` sem mudança de
  lógica: os imports ganharam a extensão `.js` e o caminho novo. As exceções são as amarras com
  o RoqueOS: `roqueCraftRoom.js` e `roqueCraftSave.js` (abaixo), `modeloDoNpc.js` (saíram os
  provedores de LLM do front; fica o modelo que fala por um `completar` injetado),
  `falaDoRoqueOS.js` (liga o aldeão ao `host.ia`), `cargaDoSave.js` (recebe o `avisar` do host)
  e `ganchoDeQA.js` (lê o modo E2E do SDK).
- O código de GPU (`src/servicos/render/`, `cena.js`, clima, água, céu, sombras, texturas) veio
  sem mudança fora os caminhos de import. A única linha de lógica tocada é a do perfil
  detectado: `detectQuality()` lia `data-low-end` do `<html>` e agora recebe `{ leve }`, que o
  componente tira do `host.desempenho.modoLeve()`.
- O Worker do terreno continua nascendo do mesmo jeito, com `new URL(..., import.meta.url)` e
  `{ type: 'module' }`: no `yarn dev` ele é servido como worker de módulo, e o `vite build` o
  emite como arquivo próprio.
- A sala deixa de falar com o Firebase: vem do host, pela `salaAoVivo`. O `roqueCraftRoom.js`
  continua com os mesmos nomes, agora sobre ela (`criarSalaDoRoqueCraft`); os nós (`meta`,
  `players/{uid}`, `blocks`, `mobs`, `relogio`, `mobilia`, `hits`, `chat`) e os campos são os de
  antes. O código, o link do convite e o `meta` do anfitrião vêm do host. Sem conta, quem recusa
  a sala é o host, e o lobby mostra o aviso de conta depois da recusa (antes aparecia logo ao
  abrir o lobby). Quem entra numa sala não recebe link do host: o QR do convidado fica vazio e
  "copiar convite" copia o código.
- O convite pelo link é lido uma vez, ao abrir o jogo (antes vinha pela prop `joinCode`).
- O save deixa de falar com o Firestore: vem do host, pelo `progresso`, substituindo o
  documento (o `setDoc` sem merge de antes). Leitura que falha rejeita, o jogador vê um aviso
  fixo e nada é gravado por cima (RC-02). Quem decide se há onde gravar é o
  `progresso.disponivel()`, não mais o uid.
- O teclado: só a janela ativa escuta, e ela reivindica o `host.teclado` enquanto o jogador está
  no mundo sem tela aberta; perder o foco, abrir uma tela ou fechar o jogo devolve. Perder o
  foco também solta os comandos segurados. Era o `focoDoTeclado` do RoqueOS.
- Os avisos (`showNotification` da store) vão ao `host.avisar`, com os tipos do contrato
  (`src/avisos.js`); o aviso de save ilegível é `fixo`, que era o `timeout: 0`.
- O texto mora em `i18n/`, um JSON por idioma (antes `src/i18n/<idioma>/roqueCraft.js` e o
  carregador `roqueCraftTextos.js`), com o `title` e o `common.close`/`common.back` de volta. As
  telas `RC*` recebem o mesmo `t` por `provide`/`inject`, com as chaves de antes. Em árabe a
  tela vira da direita para a esquerda.
- Fora do Quasar: os dois `q-icon` viraram `src/Icone.vue` e o `q-spinner-dots` do lobby virou
  um SVG igual. O estilo que vinha dos tokens do RoqueOS ganhou o valor do tema padrão como
  recuo, e o `roquecraft.scss` (os tokens `--rc-*` e a barra de rolagem) ficou sob
  `.ros-roquecraft`, sem declarar nada no `:root` do host.
- `three` e `qrcode` viram `peerDependencies`: o RoqueOS fornece os dele, nas mesmas versões.
- Os 106 arquivos de `public/games/roquecraft/` vieram byte a byte, no mesmo caminho. Cada
  arquivo de `public/` tem licença e origem no `ASSETS.md`.
- A regra 44, os 25 planos `roquecraft-*` e o dev-doc estão em `docs/`; os 122 roteiros de QA e
  geradores de asset, em `qa/`, sem mudança, com o `qa/lib/preparar-dist.mjs` que os faz rodar
  contra este repo.
- Testes: os 184 arquivos do motor, os 16 dos composables e os 9 das telas que rodavam no front,
  agora sem nada do RoqueOS, mais: a sala sobre o host falso (anfitrião, convidado, bichos,
  golpe consumido, baú recusado pela regra, sucessão, queda, sem conta), o save sobre o
  `progresso` (substituir, recusa, leitura que falha), a carga e o aviso fixo, a janela ativa e o
  teclado, o aldeão sobre a `ia` do contrato, os tipos de aviso, e o jogo inteiro montado pelo
  contrato (os seis casos do `roquecraftMonta.spec.js` do front, idioma, árabe, perfil leve,
  convite, lobby sem conta).
- Defeitos conhecidos, não consertados nesta versão e marcados com `it.fails`: o save com array
  dentro de array (inventário, mobília, `outrasDimensoes`), que o Firestore e o host do SDK
  recusam; e a presença do anfitrião que cai com gente na sala e fica, sem sucessão.
