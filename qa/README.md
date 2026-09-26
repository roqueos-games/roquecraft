# Roteiros de QA do RoqueCraft

Os 122 arquivos desta pasta (fora este README e `lib/preparar-dist.mjs`) são os roteiros de QA,
os geradores de asset e as ferramentas de medição que o RoqueCraft tinha em `scripts/` do
roqueos-front, copiados do `master` `7ab22a6f` sem mudar um byte (conferido pelo hash do git). Os
quatro arquivos de `lib/` que eles importam (`servidor-do-dist.mjs`, `rc-mirar.mjs`,
`rc-armadilha-gl.mjs`, `qa-orientacao.mjs`) vieram de `scripts/lib/` do mesmo commit, também
sem mudança.

**Eles miram um RoqueOS rodando.** Foram escritos para o build do front (`dist/pwa`), abrem
`/app`, esperam `window.__rosStore` e abrem a janela do jogo, que no RoqueOS de hoje fica em
`/jogar/roquecraft`. Os comentários e as linhas de uso ainda dizem `node scripts/...`: é o
caminho do front, e aqui o caminho é `node qa/...`. As fotos e os relatórios saem em
`scripts/.qa-<sonda>/`, relativo à pasta de onde se roda (ignorada pelo git).

## Rodar contra este repo

`lib/preparar-dist.mjs` é a única peça nova. Ele constrói a página de desenvolvimento do repo
(`index.html` + `dev/main.js`, com o host de desenvolvimento do SDK) em `dist/pwa` e escreve ao
lado um `app.html` com um `__rosStore` de mentira: abrir a janela não faz nada, porque o jogo já
abre sozinho. O `servidor-do-dist.mjs` serve esse `app.html` em `/app`, e a sonda nem percebe.

```sh
node qa/lib/preparar-dist.mjs          # da raiz do repo; imprime o nome do chunk do Worker
node qa/qa-roquecraft-console-limpo.mjs
```

O host de desenvolvimento não tem conta, não tem `ia`, guarda o progresso no `localStorage` e
faz a sala ao vivo entre abas do mesmo navegador. O que a sonda medir de rede de verdade
(Firebase, duas contas) não se mede aqui.

## O que rodou, em 26/09/2026

Contra o `dist/pwa` feito por `lib/preparar-dist.mjs` a partir deste repo, no Mac do founder,
com o Playwright 1.60.0 das devDependencies. Todas saíram com código 0:

| sonda                           | o que mediu                                                                                           | tempo |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ----- |
| `qa-roquecraft-console-limpo`   | 20 s em ultra e 8 s em cada troca de perfil (low, ultra, medium, high): 0 erro de render, 0 exceção   | 65 s  |
| `qa-roquecraft-entrada`         | "Novo mundo" troca a semente (771102 → 12197) e fecha o menu; 0 buraco e 0 sobra na malha             | 42 s  |
| `qa-roquecraft-mobile`          | iPhone no WebKit e no Chromium: qualidade `low`, 703 seções, ~110 mil triângulos, 0 erro              | 36 s  |
| `qa-roquecraft-persistencia`    | o payload real do autosave leva os três bichos com a vida e a versão 12                               | 5 s   |
| `qa-roquecraft-mobilia-da-sala` | a entrada da sala vira baú no mundo, a tela aberta redesenha, `null` esvazia, quebrar devolve ao chão | 8 s   |
| `qa-roquecraft-relogio-da-sala` | o acerto de relógio do anfitrião chega ao `ticks` e a chuva forçada chega ao clima do bioma           | 4 s   |

Na `persistencia`, o campo `gravados` (itens no chão) sai vazio porque a própria sonda chama
`limparMobs` depois de soltar os itens, e `limparMobs` esvazia bichos, itens e flechas juntos. O
veredito dela não olha esse campo; é assim também no front.

O multijogador de verdade (duas abas, uma cria a sala, a outra entra pelo código e vê o mundo do
anfitrião) foi medido pelo roteiro da extração, fora deste repo, contra o `yarn dev`.

As demais sondas não foram rodadas na extração. Não se sabe de motivo para as que servem
`dist/pwa` não rodarem aqui, mas isso não foi medido.

## O que não roda aqui

- `qa-roquecraft-prod` e `qa-roquecraft-prod-mobile` miram o RoqueOS publicado.
- `qa-roquecraft-cachoeira`, `-ceu`, `-malha`, `-mobs`, `-itens-mortos` e `-jornada` (e os
  `.impl.mjs` deles) importam o motor pelo caminho do front (`src/services/roquecraft/...`),
  que aqui é `src/servicos/`.
- `qa-roquecraft-dragao` e `qa-roquecraft-fortaleza` leem os avisos na bandeja do RoqueOS
  (`__rosStore.notifications`); aqui ela fica vazia, porque o host de desenvolvimento avisa no
  console. Não foram rodadas.
- `capture-roquecraft-cover.mjs` escreve a capa no caminho do front; a capa daqui é a arte de
  `gen-roquecraft-art.mjs` (ver `ASSETS.md`).
