#!/usr/bin/env python3
"""
O SOM DE ONDAS DA PRAIA — sintetizado, e o porquê.

"O som de ondas está irritante, procure um som de ondas do mar mais suave e
relaxante para colocar na praia" — founder, 25/08/2026.

⚠️ O DEFEITO NÃO ERA DE GOSTO, ERA DE DURAÇÃO, e dá pra medir: o
`amb-ondas.ogg` que estava no jogo tinha DOIS SEGUNDOS. Todos os outros leitos
de ambiente têm de seis a catorze. Dois segundos em loop repetem trinta vezes
por minuto, e o ouvido tranca nessa periodicidade em poucos ciclos — a partir
daí não se escuta mais o mar, escuta-se o loop. Nenhuma escolha de amostra
conserta isso; o que conserta é o loop ser longo.

POR QUE SINTETIZAR EM VEZ DE BAIXAR OUTRA AMOSTRA

Três razões, e a terceira é a que decide:

1. Rebentação é ruído filtrado por um envelope lento. É exatamente o tipo de
   som que a síntese faz bem — não há transiente, ataque nem timbre a imitar.
2. O loop pode ser feito MATEMATICAMENTE sem costura: se todo componente do
   envelope tem período que divide a duração, o fim encontra o começo sem
   emenda. Amostra gravada precisa de crossfade, que é sempre um remendo.
3. Licença: isto nasce CC0 por construção. O resto do pacote de áudio veio de
   fontes CC0 rastreadas em CREDITOS.md; esta não precisa de rastro nenhum
   porque não veio de lugar nenhum.

COMO A REBENTAÇÃO É FEITA

Ruído rosa (energia caindo com a frequência, que é o espectro da água em
movimento), passado por um filtro passa-baixa fixo e MAIS um passa-baixa que
respira junto com a onda — a espuma tem agudo, o refluxo não. O envelope é a
soma de cinco senos de períodos incomensuráveis dentro do loop, mais um pulso
de rebentação que sobe rápido e desce devagar.

⚠️ O AGUDO É O QUE IRRITA. Rebentação real vista de longe é quase toda grave: o
sibilo de 3 a 8 kHz é o que o ouvido interpreta como chiado. O passa-baixa fica
em 1,1 kHz, bem abaixo do que "soa realista" de perto, porque a praia deste jogo
é paisagem de fundo e não um close de espuma.

Uso:
    python3 scripts/gen-roquecraft-ondas.py
Requer: numpy, ffmpeg.
"""
import os
import subprocess
import sys
import wave

import numpy as np

SR = 32000  # a taxa do resto do pacote
DUR = 24.0  # segundos: doze vezes o loop antigo
SAIDA = os.environ.get(
    'RC_ONDAS_OUT',
    os.path.join(os.path.dirname(__file__), '..', 'public/games/roquecraft/audio/amb-ondas.ogg'),
)

n = int(SR * DUR)
t = np.arange(n) / SR
rng = np.random.default_rng(20260825)


def _um_polo(x, a):
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = a * acc + (1 - a) * x[i]
        y[i] = acc
    return y


def passa_baixa(x, corte, sr=SR, circular=False):
    """
    Um polo, aplicado duas vezes (ida e volta) para não deslocar a fase.

    ⚠️ `circular=True` NÃO É REFINAMENTO — é o que mantém o loop sem emenda.

    Um filtro comum começa com o acumulador em zero: os primeiros milissegundos
    saem rampados a partir do silêncio e os últimos idem. Aplicado ao ENVELOPE,
    isso destrói exatamente a propriedade que faz o loop fechar — a medição
    acusou o início com nove vezes a energia do fim, ou seja um degrau audível a
    cada volta. Filtrando o sinal LADRILHADO três vezes e ficando com o terço do
    meio, cada ponta enxerga a outra como vizinha e a periodicidade sobrevive.
    """
    a = np.exp(-2.0 * np.pi * corte / sr)
    if circular:
        n = len(x)
        tri = np.concatenate([x, x, x])
        z = _um_polo(tri, a)
        z = _um_polo(z[::-1], a)[::-1]
        return z[n : 2 * n]
    y = _um_polo(x, a)
    return _um_polo(y[::-1], a)[::-1]


def ruido_rosa(n):
    """Ruído branco moldado em 1/f no domínio da frequência."""
    branco = rng.standard_normal(n)
    espectro = np.fft.rfft(branco)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    espectro /= np.sqrt(f)
    saida = np.fft.irfft(espectro, n)
    return saida / (np.abs(saida).max() + 1e-9)


# ── O ENVELOPE ──────────────────────────────────────────────────────────────
#
# ⚠️ TODO PERÍODO DIVIDE A DURAÇÃO — é isto, e só isto, que faz o loop não ter
# costura. Cada componente completa um número INTEIRO de ciclos em 24 s, então
# o valor (e a derivada) no fim é idêntico ao do começo. Um período qualquer
# deixaria um degrau no ponto de emenda, que é o "tec" audível de todo loop mal
# fechado.
#
# Os números de ciclos são primos entre si, o que espalha os batimentos: a soma
# só se repete depois de 24 s, nunca antes.
CICLOS = [(3, 0.34), (5, 0.26), (7, 0.18), (11, 0.13), (17, 0.09)]
env = np.zeros(n)
for k, peso in CICLOS:
    fase = rng.random() * 2 * np.pi
    env += peso * np.sin(2 * np.pi * k * t / DUR + fase)
env = 0.5 + 0.5 * env / sum(p for _, p in CICLOS)

# A REBENTAÇÃO: sobe rápido, desce devagar. Onda que sobe e desce igual soa como
# alguém girando um botão de volume; a assimetria é o que a faz quebrar.
quebra = np.zeros(n)
for k in (3, 5):
    f = (k * t / DUR) % 1.0
    quebra += np.where(f < 0.18, (f / 0.18) ** 0.6, np.exp(-(f - 0.18) * 3.4)) / 2
env = np.clip(0.35 * env + 0.65 * quebra, 0, 1.4)
env = passa_baixa(env, 1.2, circular=True)  # tira o canto SEM quebrar a periodicidade

# ── O SOM ───────────────────────────────────────────────────────────────────
# ⚠️ O RUÍDO É GERADO MAIS LONGO QUE O LOOP, de propósito.
#
# O envelope fecha por construção (todo período divide a duração), mas o ruído
# não fecha por nada: ele é aleatório, e o último quadro não tem relação com o
# primeiro. O salto medido na emenda era 0,0033 contra um passo típico de
# 0,0004 — um clique a cada volta.
#
# A sobra `FADE` existe pra que o começo do loop possa ser cruzado com o trecho
# que VIRIA logo depois do fim. Aí a junção liga duas amostras VIZINHAS do mesmo
# ruído, que é contínua por definição.
FADE = int(0.03 * SR)
base = ruido_rosa(n + FADE)
grave = passa_baixa(base, 320)  # o corpo: o ronco da água
medio = passa_baixa(base, 1100)  # a espuma, já bem contida
w = np.linspace(0.0, 1.0, FADE)
for camada in (grave, medio):
    camada[:FADE] = camada[:FADE] * w + camada[n : n + FADE] * (1 - w)
grave = grave[:n]
medio = medio[:n]
# A espuma só aparece no PICO da rebentação. Amarrar o agudo ao envelope é o que
# transforma "chiado constante" em "onda quebrando".
sinal = grave * 0.85 + medio * (0.35 * np.clip(env - 0.55, 0, 1) / 0.45)
sinal *= env

# Normaliza por ENERGIA e deixa folga de pico: ambiente não pode encostar no
# teto, senão ele briga com passo, chuva e vento na mesma mistura.
rms = np.sqrt(np.mean(sinal**2))
sinal *= (10 ** (-26.0 / 20)) / (rms + 1e-9)
pico = np.abs(sinal).max()
if pico > 0.5:
    sinal *= 0.5 / pico

pcm = (np.clip(sinal, -1, 1) * 32767).astype('<i2')
tmp = '/tmp/rc-ondas.wav'
with wave.open(tmp, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

alvo = os.path.abspath(SAIDA)
r = subprocess.run(
    # ⚠️ PRECISA DE UM ffmpeg COM libvorbis. O do Homebrew no Mac não traz —
    # e o encoder `vorbis` nativo do ffmpeg, que seria a alternativa óbvia,
    # recusa qualquer combinação de taxa e qualidade que eu tentei (erro −22) e
    # ainda TRUNCOU o arquivo de destino para zero byte na tentativa. O arquivo
    # versionado foi regravado num ambiente que tem o libvorbis.
    #
    # Trocar o codec (para Opus, por exemplo) resolveria o encoder e criaria
    # outro problema: um leito do pacote em formato diferente dos outros seis.
    ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', tmp,
     '-c:a', 'libvorbis', '-q:a', '3', '-ar', str(SR), '-ac', '1', alvo],
    capture_output=True, text=True,
)
if r.returncode:
    print(r.stderr[-400:], file=sys.stderr)
    sys.exit(1)
print(f'{alvo}  {DUR:.0f}s  {os.path.getsize(alvo)/1024:.0f} KB')
