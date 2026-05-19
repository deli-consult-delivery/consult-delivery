---
name: consult-delivery-bomdia
description: Gera imagens de "bom-dia" diárias para grupos de WhatsApp dos clientes da consultoria Consult Delivery, usando Recraft V4.1 em formato feed (16:9) ou story (9:16), com overlay automático do logo. Use sempre que o usuário pedir "gerar bom-dia", "imagem de segunda/terça/.../domingo", "post motivacional Consult Delivery", "card de WhatsApp", ou qualquer variação dessas frases — mesmo que não mencione explicitamente o agente ou o gerador. Cobre identidade visual, tom da semana, biblioteca de frases, prompt template e checklist de QA.
---

# Consult Delivery — Bom-Dia Visual

Skill responsável por gerar **imagens diárias de bom-dia** enviadas nos grupos de WhatsApp dos clientes da consultoria. Cada imagem precisa carregar a identidade visual da Consult Delivery, casar com o tom do dia da semana e sair pronta — sem edição manual posterior.

## Stack

- **Gerador de imagem**: Recraft V4.1 (raw API ou MCP)
- **Formato feed**: 1820×1024 px (16:9 horizontal)
- **Formato story**: 1024×1820 px (9:16 vertical)
- **Overlay**: logo Consult Delivery em PNG transparente (`assets/logo-consultdelivery.png`), aplicado pós-geração via Pillow/Sharp
- **Idioma do prompt**: inglês (Recraft performa melhor) + texto-alvo em **português entre aspas** dentro do prompt

## Workflow de execução

Quando acionado, executar nesta ordem:

1. **Identificar dia da semana** (hoje, ou o dia que o usuário pediu) e **formato** (feed ou story; default = feed)
2. **Selecionar mensagem** da biblioteca (`references/frases-semana.md`) — nunca repetir frase usada nos últimos 30 dias (consultar log)
3. **Montar prompt Recraft** usando o template em "Prompt Template" abaixo, preenchendo as variáveis com a tabela do dia
4. **Gerar imagem** via Recraft V4.1
5. **Aplicar overlay do logo** no canto inferior direito (script `scripts/apply_logo.py`)
6. **Rodar checklist de QA** (se falhar em qualquer item, regenerar)
7. **Salvar no log** (data, frase usada, formato) e entregar

Se o usuário pedir variação ou refusal da primeira imagem, regenerar mantendo a mesma frase mas trocando elementos visuais e ângulo de composição.

---

## Identidade Visual (não negociável)

### Paleta de cores

| Cor | Hex | Uso |
|---|---|---|
| Vermelho Consult | `#E63946` | Cor-marca, energia, palavra-chave em destaque, raios de luz |
| Vermelho profundo | `#B71C2C` | Variação para gradientes e sombras |
| Azul-marinho | `#0A1929` | Fundo dominante alternativo |
| Preto-azulado | `#0F172A` | Fundo dominante principal |
| Cinza painel | `#1A1F2E` | Cards, dashboards, painéis de UI dentro da imagem |
| Branco puro | `#FFFFFF` | Texto principal |
| Azul vibrante | `#1E88E5` | Accent ocasional (~15% das imagens, gráficos digitais) |

**Regra**: vermelho **nunca é decorativo**. Sempre carrega movimento (raios, trilhas), energia (motoboy, setas) ou destaque tipográfico (1 palavra-chave). Nunca usar vermelho em mais de ~40% da imagem.

### Tipografia

- **Família**: sans-serif bold condensada, estilo Montserrat ExtraBold, Anton, Bebas Neue ou Inter Black
- **Frase principal**: peso 800-900, tamanho gigante (ocupa 40-55% da altura)
- **Subtítulo**: peso 600, ~35-40% do tamanho da principal
- **Cor**: branco puro sobre fundo escuro (alto contraste obrigatório)
- **Acento opcional**: 1 ou no máximo 2 palavras da frase principal em vermelho `#E63946`

### Elementos visuais (escolher 1-3 por imagem, nunca mais)

Biblioteca controlada — não inventar elementos fora desta lista:

- 🏍️ Motoboy/entregador (silhueta dinâmica OU ilustração 3D estilizada)
- 📦 Caixas/pacotes de delivery (em motion blur ou estáticas)
- 📈 Setas de crescimento ascendentes (vermelhas ou brancas)
- 📊 Dashboard/painel de pedidos (UI mockup escuro)
- 🗺️ Mapa estilizado com pinos de rota
- 📱 Smartphone ou tablet mostrando app de pedidos
- ✨ Trilhas de luz horizontais (motion blur de velocidade)
- 🏆 Troféu — **apenas** sexta, sábado ou domingo
- 🎉 Confete — **apenas** sexta ou domingo
- ⚙️ Engrenagens — **apenas** sábado (reflexão estratégica)

### Composição (regras rígidas)

1. **Canto inferior direito SEMPRE limpo** — reservado pro overlay do logo. Nenhum elemento visual nem texto pode invadir essa região (15% da largura × 20% da altura, contando 5% de padding).
2. **Texto à esquerda OU centralizado**. Nunca à direita.
3. **Elemento visual** posicionado na lateral oposta ao texto, atrás dele em opacidade reduzida, ou em diagonal.
4. **Hierarquia visual**: frase principal > subtítulo > elemento visual > fundo. Quem olha 1 segundo tem que ler a frase.
5. **Profundidade**: usar profundidade de campo, glow sutil, gradientes radiais. Nunca flat.

### Estilo geral

- Estética **digital/tecnológica moderna**
- Iluminação dramática com glow vermelho e/ou azul
- Motion blur sutil em elementos de velocidade
- Renderização: ilustração 3D realista **ou** vector design moderno (escolher um por imagem, não misturar)
- Sensação cinematográfica, não cartunesca

---

## Mapa Semanal de Tons

Cada dia tem mood, paleta dominante e elementos preferenciais. **Não improvisar** fora desta tabela.

| Dia | Mood | Paleta dominante | Elementos sugeridos | Lighting |
|---|---|---|---|---|
| **Segunda** | Energia de início, ritmo, organização | Vermelho intenso + preto | Motoboy em movimento + caixas + raios de luz | Raios diagonais vermelhos vindos da esquerda |
| **Terça** | Foco, constância, ritmo mantido | Vermelho + azul-marinho | Dashboard escuro + listas + setas firmes | Glow vermelho central, fundo escuro |
| **Quarta** | Evolução, ponto médio, força | Azul-marinho + vermelho de accent | Smartphone com gráfico crescente | Glow azul radial, vermelho pontual |
| **Quinta** | Ajuste, refinamento, crescimento | Azul-marinho + vermelho destaque | Dashboard + caixa marcada + métricas | Spot light vermelho sobre dashboard |
| **Sexta** | Disciplina vira resultado, fechamento | Vermelho + azul profundo | Gráficos altos + trilhas de luz + dashboard cheio | Trilhas horizontais vermelhas vibrantes |
| **Sábado** | Reflexão, planejamento estratégico | Tons escuros + vermelho sutil | Caderno + tablet + planejamento + engrenagens | Iluminação suave, menos saturada |
| **Domingo** | Celebração, conquista da semana | Vermelho + azul + confete | Troféu + confete + barras de progresso completas | Festivo, glow geral, partículas |

---

## Biblioteca de Frases

⚠️ **Regra de variação**: nunca repetir frase usada nos últimos 30 dias. Manter log em `logs/frases-usadas.json`.

Frases-base (variar livremente, manter o tom):

### Segunda (energia/início)
- "Organize cedo, venda com ritmo" / sub: "Segunda-feira: energia para começar a semana"
- "Comece com clareza, termine com lucro"
- "Plano na mão, motoboy na rua"
- "Semana forte no delivery"
- "Primeira virada da semana começa agora"

### Terça (foco/constância)
- "Foco hoje, resultado constante"
- "Disciplina vira resultado no delivery"
- "Constância é o segredo do pedido recorrente"
- "Cada turno é uma chance de melhorar"

### Quarta (evolução/meio)
- "Quarta firme, delivery em evolução"
- "Ânimo no meio, delivery no topo"
- "Metade da semana, dobro da intenção"
- "Ritmo de quarta é ritmo de quem cresce"

### Quinta (ajuste/refinamento)
- "Cresça em cada ajuste" / sub: "Quinta de evolução no delivery"
- "Pequenos ajustes, grandes pedidos"
- "Refine hoje, fature amanhã"
- "Cresça um pedido por vez"

### Sexta (disciplina/conquista)
- "Disciplina vira resultado no delivery"
- "Sexta de virada, fim de semana de meta"
- "Fechamento forte abre semana melhor"

### Sábado (reflexão/planejamento)
- "Revisar hoje, vender melhor" / sub: "Sábado de reflexão e preparação estratégica"
- "Analise o que rodou, planeje o que vem"
- "O melhor delivery começa no caderno"

### Domingo (celebração)
- "Seu delivery venceu mais uma semana"
- "Semana fechada, próxima já chega forte"
- "Comemora hoje, amanhã o ciclo recomeça"

Quando inventar frases novas, manter:
- Máximo 6 palavras na frase principal
- Subtítulo opcional, máximo 8 palavras
- Tom: motivacional sem clichê, focado em ação/disciplina
- Vocabulário do nicho: delivery, pedido, motoboy, dashboard, ritmo, foco, ajuste, crescimento

---

## Prompt Template (Recraft V4.1)

Sempre montar o prompt em **inglês**, com o texto-alvo em português entre aspas duplas. Recraft V4.1 renderiza acentos corretamente quando o texto está explicitamente delimitado.

### Template base

```
Modern digital marketing banner for a Brazilian delivery consultancy called "Consult Delivery", {FORMATO}, dark {COR_FUNDO} background with {COR_ACCENT} accents and dramatic lighting. 

Bold condensed sans-serif typography rendering EXACTLY the Portuguese text "{FRASE_PRINCIPAL}" in large white letters as the main headline, with no spelling errors, no missing accents, no extra characters. Below in smaller font, render EXACTLY the subtitle "{SUBTITULO}" in white. {DESTAQUE_VERMELHO}

Visual elements: {ELEMENTOS}. {LIGHTING}.

Composition: text aligned to the {TEXT_ALIGN}, visual elements positioned on the opposite side or behind the text with reduced opacity. The lower-right corner MUST be completely clean and free of any visual elements, text, or graphics — this area is reserved for a logo overlay added in post-production.

Style: cinematic 3D realistic illustration, high contrast, professional tech aesthetic, motion blur on speed elements, subtle depth of field. Mood: {MOOD}. Energetic, modern, polished.

Color palette: dominant {COR_FUNDO} (#0F172A), accents in {COR_ACCENT}, white text. No cartoonish elements, no flat illustration, no stock photo look.
```

### Variáveis (preencher por dia/formato)

| Variável | Feed | Story |
|---|---|---|
| `{FORMATO}` | `16:9 horizontal banner format, 1820x1024 pixels` | `9:16 vertical story format, 1024x1820 pixels` |
| `{TEXT_ALIGN}` | `left` (default) ou `center` | `center` (default) ou `top` |

Demais variáveis preenchidas pela tabela semanal:

- `{FRASE_PRINCIPAL}` = da biblioteca
- `{SUBTITULO}` = da biblioteca (pode ser omitido se nenhum)
- `{COR_FUNDO}` = ver tabela do dia (ex: `deep navy and black`, `dark navy with red accents`)
- `{COR_ACCENT}` = ver tabela do dia (ex: `vibrant red #E63946`, `electric blue and red`)
- `{ELEMENTOS}` = 1-3 da lista do dia, descritos em inglês (ex: `a stylized delivery rider on a motorcycle in motion blur, glowing red light trails, floating delivery boxes with motion lines`)
- `{LIGHTING}` = ver tabela (ex: `Diagonal red light rays coming from the left side`)
- `{MOOD}` = ver tabela (ex: `Monday morning energy, ready to start the week`)
- `{DESTAQUE_VERMELHO}` = opcional, ex: `Highlight the word "delivery" in bright red (#E63946) instead of white`. Omitir se a frase não pedir destaque.

### Exemplo preenchido (segunda, feed)

```
Modern digital marketing banner for a Brazilian delivery consultancy called "Consult Delivery", 16:9 horizontal banner format, 1820x1024 pixels, dark deep navy and black background with vibrant red accents and dramatic lighting.

Bold condensed sans-serif typography rendering EXACTLY the Portuguese text "Organize cedo, venda com ritmo" in large white letters as the main headline, with no spelling errors, no missing accents, no extra characters. Below in smaller font, render EXACTLY the subtitle "Segunda-feira: energia para começar a semana" in white.

Visual elements: a stylized delivery rider on a motorcycle silhouette in motion blur on the right side, floating red delivery boxes with motion trails, dynamic upward red arrows in the background. Diagonal red light rays coming from the left side cutting across the composition.

Composition: text aligned to the left, visual elements positioned on the right side and behind the text with reduced opacity. The lower-right corner MUST be completely clean and free of any visual elements, text, or graphics — this area is reserved for a logo overlay added in post-production.

Style: cinematic 3D realistic illustration, high contrast, professional tech aesthetic, motion blur on speed elements, subtle depth of field. Mood: Monday morning energy, ready to start the week with rhythm and discipline. Energetic, modern, polished.

Color palette: dominant deep navy (#0F172A), accents in vibrant red (#E63946), white text. No cartoonish elements, no flat illustration, no stock photo look.
```

---

## Overlay do Logo

Após receber a imagem do Recraft, aplicar o logo via script:

```bash
python scripts/apply_logo.py \
  --input gerada.png \
  --logo assets/logo-consultdelivery.png \
  --output final.png \
  --position bottom-right \
  --padding-pct 5 \
  --logo-width-pct 14
```

Especificação:
- **Posição**: canto inferior direito
- **Padding**: 5% da largura/altura da imagem em cada margem
- **Largura do logo**: 14% da largura da imagem (feed) ou 18% (story)
- **Variante do logo**: branca em fundo escuro (PNG transparente, em `assets/logo-consultdelivery.png`)

### Logos disponíveis em `assets/`

| Arquivo | Conteúdo | Quando usar |
|---|---|---|
| `logo-consultdelivery.png` | Variante **branca** (texto + ícone brancos, fundo transparente) | **Padrão** — todos os cards Bom Dia (fundo escuro) |
| `logo-01.png` | Mesmo que acima (fonte original) | Backup da variante branca |
| `logo-02.png` | Logo completo colorido (foguete vermelho + texto preto, fundo branco) | Fundo claro — não usar nos cards |
| `logo-03.png` | Só o foguete vermelho, sem texto, fundo branco | Ícone isolado para variações |

Se o canto inferior direito da imagem gerada estiver visualmente poluído (falhou a regra de composição), regenerar antes de aplicar o logo.

---

## Checklist de QA (rodar antes de entregar)

Verificar cada item. Se algum falhar, regenerar.

- [ ] Texto principal renderizado SEM erros de ortografia e SEM acentos faltando
- [ ] Subtítulo renderizado corretamente (ou ausente se não havia)
- [ ] Logo Consult Delivery aplicado, legível e no canto inferior direito
- [ ] Canto inferior direito sem conflito visual com o logo
- [ ] Paleta dentro da identidade: vermelho + navy/preto + branco dominantes
- [ ] Vermelho ocupa no máximo ~40% da imagem
- [ ] No máximo 3 elementos visuais
- [ ] Frase escolhida não foi usada nos últimos 30 dias (consultar log)
- [ ] Dimensões corretas: 1820×1024 (feed) ou 1024×1820 (story)
- [ ] Mood casa com o dia da semana (ver tabela)
- [ ] Frase principal legível em 1 segundo (alto contraste, tamanho grande)
- [ ] Estilo cinematográfico/3D ou vector moderno (nada cartunesco/flat/stock)
- [ ] Sem texto fantasma, sem letras extras, sem ruído tipográfico

---

## Anti-patterns (nunca fazer)

❌ Usar mais de 3 elementos visuais — vira poluído
❌ Colocar texto à direita — quebra a hierarquia com o logo
❌ Pedir o logo "Consult Delivery" no prompt do Recraft — sempre via overlay
❌ Misturar estilo 3D realista com vector flat na mesma imagem
❌ Vermelho cobrindo mais de 40% da imagem — cansa a vista
❌ Frase com mais de 6 palavras — não cabe legível
❌ Repetir frase usada nos últimos 30 dias
❌ Inventar elementos fora da biblioteca controlada
❌ Usar troféu/confete em dia que não seja sexta/sábado/domingo
❌ Esquecer de reservar o canto inferior direito
❌ Acentos faltando — sempre conferir "ç", "ã", "é", "ó", "í" no output

---

## Log e versionamento

Manter `logs/frases-usadas.json` no formato:

```json
{
  "2026-05-17": {
    "frase": "Foco hoje, resultado constante",
    "dia_semana": "domingo",
    "formato": "feed",
    "tenant": "consult"
  }
}
```

Antes de selecionar uma frase, consultar este log e filtrar as últimas 30 entradas.

---

## Quando o usuário pedir variação

Se ele rejeitar a primeira imagem, regenerar mantendo:
- Mesma frase
- Mesmo mood do dia
- Mesma paleta

Variando:
- Composição (ângulo, posição do elemento)
- Elementos visuais (escolher outros 1-3 da lista do dia)
- Detalhes de iluminação

Se rejeitar 3 vezes seguidas, sugerir trocar a frase.
