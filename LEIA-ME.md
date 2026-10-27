# Pregão de Swaps — jogo de swaps para sala de aula

Os alunos escaneiam um QR Code com o celular e entram numa simulação de pregão de
**swaps de juros (DI × pré)** e **swaps cambiais (dólar × DI)**, com valor de referência de
R$ 1 milhão por contrato. Cada celular é um aluno ou um grupo, com um destes papéis:

| Papel | Situação | Proteção (hedge) |
|---|---|---|
| **Empresa endividada** | vai captar R$ 2 mi no vencimento à taxa pré da época; teme a ALTA dos juros | ativo em DI × passivo em pré (0, 1 ou 2 contratos) |
| **Fundo de renda fixa** | vai aplicar R$ 2 mi no vencimento à taxa pré da época; teme a QUEDA dos juros | ativo em pré × passivo em DI (0, 1 ou 2) |
| **Importadora** | vai pagar US$ 400 mil no vencimento; teme a ALTA do dólar | ativo em dólar × passivo em DI (0, 1 ou 2) |
| **Exportadora** | vai receber US$ 400 mil no vencimento; teme a QUEDA do dólar | ativo em DI × passivo em dólar (0, 1 ou 2) |
| **Tesouraria** | sem exposição; capital de R$ 100.000 | escolhe a posição nos dois swaps a cada rodada (até 3 contratos em cada) |

Antes do pregão, quem faz hedge escolhe também **onde registrar** o swap:
**com garantia na B3** (custo de R$ 500 por contrato; a B3 é a contraparte central) ou
**bilateral, sem garantia** (sem custo, mas com risco de crédito).

A cada rodada o professor revela uma **notícia** (Copom, Fed, inflação, risco fiscal, China,
petróleo, rating, leilão de swap do BC…). Os alunos dão dois palpites (a taxa pré sobe ou cai? o
dólar sobe ou cai?), a tesouraria ajusta as posições e o professor revela o **choque**. O jogo
**marca a mercado** cada swap: no swap **não há ajuste diário**, nada é pago durante o jogo e tudo
é liquidado pela diferença no vencimento.

Com o **evento de crédito** ligado (padrão), numa rodada da segunda metade o BC decreta
intervenção num banco médio: quem tinha swap **bilateral sem garantia** perde o ganho acumulado
e fica sem proteção. Quem registrou **com garantia na B3** segue protegido. A tesouraria tem um
**limite de risco**: se a perda passar de R$ 80.000, o comitê de risco encerra as posições.

No vencimento a tela mostra a **taxa efetiva** de cada empresa e fundo, o **dólar efetivo** de cada
importadora e exportadora, o resultado das tesourarias, o ranking de palpites e as lições da partida.

**Parâmetros (ilustrativos):** taxa pré inicial de 13,20% e dólar de R$ 5,00. Cada 1 p.p. na taxa
pré vale R$ 10.000 por contrato (prazo de 1 ano, aproximação) e cada R$ 0,10 no dólar vale
R$ 20.000 por contrato (US$ 200 mil). O cupom cambial e o CDI do período são ignorados para
simplificar. **As magnitudes das notícias são ilustrativas.** Você pode jogar 6, 8, 10 ou 12 rodadas.

---

## Como colocar no ar

Igual ao Pregão do Boi Gordo: o jogo precisa de um pequeno servidor (Node.js).

### Opção A — Online e gratuito no Render (recomendado)
1. No **GitHub**, crie um repositório novo (por exemplo, `pregao-swaps`).
2. Clique em **Add file → Upload files** e arraste **todo o conteúdo desta pasta**, incluindo a
   pasta `public` e exceto a pasta `node_modules`, se existir. Clique em **Commit changes**.
3. No **Render**, clique em **New → Blueprint** e escolha o repositório (o `render.yaml` já está
   pronto). Ou **New → Web Service** com Runtime `Node`, Build `npm install`, Start `npm start`,
   plano `Free`.
4. Em 2 a 3 minutos o Render mostra um endereço como `https://pregao-swaps.onrender.com`.

**Na aula:** abra `https://SEU-ENDERECO.onrender.com/professor` no computador do projetor.

> No plano gratuito o servidor "dorme" depois de 15 minutos sem uso, e o primeiro acesso pode
> levar até 1 minuto. **Abra a tela do professor uns 5 minutos antes da dinâmica.**

### Opção B — No seu notebook, na mesma rede Wi-Fi
```
npm install
npm start
```
Abra `http://localhost:3000/professor`. O QR Code já usa o IP do notebook na rede.

---

## Roteiro sugerido (25 minutos, 8 rodadas)

| Tempo | O que fazer |
|---|---|
| 0–3 min | Projete a tela do professor. Os alunos escaneiam o QR Code e digitam o nome ou o grupo. Ajuste os papéis com ↻, se quiser. Clique em **Começar**. |
| 3–6 min | **Contratação do swap**: quem faz hedge escolhe quantos contratos e onde registrar. Explique as pontas ativa e passiva e o custo da garantia. Clique em **Abrir o pregão**. |
| 6–20 min | **8 rodadas** de cerca de 90 segundos: leia a notícia → os alunos dão os palpites → **Revelar o choque** → comente o “Por quê?” e a marcação a mercado → **Próxima rodada**. |
| 20–25 min | **Resultados**: compare a taxa e o dólar efetivos de quem fez hedge de 100%, 50% e 0%, discuta o evento de crédito e as perguntas de debate da tela final. |

**Pontos para destacar:**
- Quem fez swap de 100% com garantia termina **na taxa ou no dólar inicial** (mais o pequeno custo
  da garantia), seja qual for o caminho do mercado.
- O swap não tem ajuste diário: o resultado só é pago no vencimento, e é por isso que o **risco de
  crédito** fica concentrado no fim.
- Quem economizou o custo da garantia e ficou no bilateral pode perder a proteção justamente quando
  mais precisava dela.

## Detalhes técnicos
- A partida fica na memória do servidor. Se o servidor reiniciar, a partida se perde, mas basta criar
  outra. Partidas paradas há mais de 8 horas são apagadas.
- Quem recarregar a página volta automaticamente para a mesma partida, no mesmo aparelho.
- Alunos que entram depois do início viram tesouraria.
- Os parâmetros estão no início de `server.js`, no objeto `CFG`. As notícias estão em `cards.js`.
- Tela do professor: `/professor`. Sala nova do zero: `/professor?novo=1`.
  Entrada dos alunos: `/j/CÓDIGO`, ou a página inicial `/` com o código digitado.
