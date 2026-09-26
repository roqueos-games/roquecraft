# RoqueCraft (roquecraft)

Jogo da organização roqueos-games, montado pelo RoqueOS através do `jogo-sdk`. Leia o
README antes de mudar qualquer coisa. A regra de arquitetura, os planos e o dev-doc que o jogo
tinha no RoqueOS estão em `docs/` (os caminhos citados neles são os do front).

- Gate: `yarn verificar` (o mesmo do CI e do pre-push).
- O jogo só importa `vue`, `three` (e `three/examples/jsm/...`) e `qrcode` (peers: o RoqueOS
  fornece os dele), `@roqueos-games/jogo-sdk` e arquivo deste repo. O RoqueOS confere isso e
  reprova o pin se aparecer outra coisa. Nada de `firebase`: a sala e o save são do host
  (`salaAoVivo` e `progresso`), e o `jogo check` reprova o import.
- Não troque a versão do `three`: a de `devDependencies` é a que o RoqueOS instala.
- Código que toca a GPU (`src/servicos/render/` inteiro, `cena.js`, clima, água, céu, sombras,
  texturas, perfis de qualidade, o Worker de malha) só muda com evidência num iPhone de verdade.
  O teste usa um dublê do three e não vê a GPU. `src/servicos/render/` fica fora do Prettier
  para não mudar por formatação.
- O Worker do terreno (`src/servicos/worldClient.js`) nasce com `new Worker(new URL(...))`,
  `import.meta.url` e `{ type: 'module' }`. Não troque o padrão: é o que o Vite do RoqueOS
  empacota vindo de dependência.
- Os arquivos de `public/games/roquecraft/` moram no caminho em que o jogo os carrega
  (`/games/roquecraft/`). Arquivo novo ali precisa de linha no `ASSETS.md`, com licença da
  lista aberta e origem. Textura, ícone de item e arte saem dos geradores de `qa/`: mude o
  gerador e rode de novo, não edite o PNG.
- A sala: os nós (`meta`, `players/{uid}`, `blocks`, `mobs`, `relogio`, `mobilia`, `hits`,
  `chat`) e os campos não mudam, porque do outro lado pode estar um RoqueOS antigo. O anfitrião
  simula os bichos e o relógio; o convidado desenha e manda intenção.
- O save: substitui o documento inteiro (sem `mesclar`), leva `version`, e leitura que falhou
  não grava por cima (RC-02). O formato tem array dentro de array, que o banco recusa: é
  defeito conhecido, pinado por `it.fails`, e mudar o formato é decisão do founder, com
  migração.
- Teclado: só a janela ativa escuta, e ela reivindica o `host.teclado` enquanto nenhuma tela do
  jogo está aberta. Aviso ao jogador é `host.avisar` (`fixo` onde o jogador precisa ver).
- JSON do jogo entra com `?raw` e `JSON.parse` (`src/textos.js`) ou por `fetch` de
  `public/`: o build do RoqueOS quebra com import de JSON direto.
- O RoqueCraft não tem recorde nem placar e não manda evento de métrica; mandar passa a ser
  decisão nova, não herança.
- O gancho `window.__roquecraft` (só em modo E2E) é usado pelos roteiros de `qa/` e pelo QA do
  RoqueOS: não mude a forma dele.
- Toda correção vem com teste que reprova sem ela.
- Português do Brasil no código e nos commits.
