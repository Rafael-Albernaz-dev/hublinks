# Roadmap do Hublink

**Atualizado em:** 14/10/2026

**Estado:** plano de execução para retomada; etapas futuras ainda não equivalem a autorização de implantação ou acesso a fornecedores.

**Fontes:** estado do repositório, `README.md`, `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/OPEN_QUESTIONS.md` e DRS v0.37 preservado no diretório de pesquisa, fora deste repositório público.

## 1. Como ler

- **Entregue:** existe no código e tem prova local proporcional. Não implica publicação do aplicativo ou comportamento real em fornecedor.
- **Próximo:** trabalho concreto que pode ser planejado sem assumir decisões de segurança ainda abertas.
- **Pendente de decisão:** precisa de escolha de produto, arquitetura ou operação antes de codificar a parte afetada.
- **Planejado:** sequência proposta; escopo e critérios devem ser confirmados ao iniciar a etapa.
- **Piloto:** depende de ambiente, pessoas e fornecedores reais. Teste sintético não substitui essa prova.

O Hublink tem dois percursos relacionados. O **modelo público reutilizável** permite demonstrar marca e links públicos. A **variante privada de SVAs** requer login, API autorizada, cofre central e extensão. A configuração no navegador da demonstração não é a base de segurança da variante privada.

## 2. Estado de partida

### Entregue no repositório

- Monorepo npm com web React/TypeScript, API Fastify/TypeScript e extensão Chrome Manifest V3.
- Demonstração com nome, descrição, logo PNG/JPG/WebP, cor RGB, cards de links HTTPS públicos, edição e remoção.
- Configuração local validada, importação/exportação JSON e persistência por `localStorage` em um único navegador.
- API limitada a `/health` em loopback; extensão sem permissões de host, sem troca de mensagens e sem automação.
- Verificações locais disponíveis: `npm run check` executa tipos, lint, formatação, testes e builds. O repositório já está no GitHub, mas o aplicativo não foi publicado.
- README em inglês; regras para agentes em `AGENTS.md`. O DRS bruto, com links operacionais, continua fora do repositório público.

### Ainda não entregue

- Revisão visual e funcional em navegador real, incluindo telas móveis, upload e importação/exportação manual.
- Configuração compartilhada entre computadores, persistência no servidor, instâncias por cliente ou multiempresa.
- Autenticação, sessões, 2FA do admin, painel administrativo, cofre, catálogo privado e auditoria.
- Protocolo web–extensão–API, permissões por fornecedor, adaptadores e piloto autenticado.
- CI, implantação on-premise, DNS/TLS, backup/restauração operacional e distribuição da extensão.

## 3. Sequência de entregas

### R0 — Base pública e repositório — ENTREGUE

**Resultado:** casca configurável para portfólio e estrutura técnica separada para web, API e extensão.

**Limite da prova:** o build e os testes locais não demonstram visual final em Chrome, persistência entre usuários, login ou compatibilidade com SVA. O JSON exportado pode conter dados inseridos pelo usuário e precisa de revisão antes de compartilhamento.

**Dependência seguinte:** R1 pode avançar na experiência pública; R2 deve fechar decisões antes de qualquer rota sensível da variante privada.

### R1 — Qualidade e produto reutilizável — PRÓXIMO

**Objetivo:** tornar a demonstração uma referência confiável para apresentar e configurar clientes, sem misturar dados privados com o portfólio.

**Trabalho previsto:**

1. Revisar a interface em Chrome desktop e mobile, incluindo estados vazio, muitos cards, nomes longos, logo clara/escura, RGB extremo, teclado, foco e mensagens de erro. Corrigir problemas comprovados.
2. Exercitar manualmente importação/exportação, atualização e restauração no navegador; comparar o JSON exportado com o estado exibido. Registrar o que foi observado, além dos testes automatizados.
3. Definir o modelo de reutilização: **uma instalação por cliente** ou **uma instalação com clientes isolados**. Decidir quem pode alterar marca e links, como publicar uma configuração e se ela precisa ser compartilhada entre dispositivos.
4. Se houver configuração no servidor, desenhar contrato, migração do JSON v1, controle de versões, validação e rollback. Não tratar `localStorage` como painel administrativo coletivo.
5. Definir apresentação de portfólio, revisão de conteúdo/ativos e destino de hospedagem da demonstração. Publicação do app é etapa distinta do push do código.

**Aceite para encerrar R1:** fluxo de configuração demonstrado em navegador, erros previsíveis, documentação em inglês atualizada e modelo de reutilização registrado como decisão. Links e logos de clientes só entram em ambiente apropriado e com direito de uso.

### R2 — Fechar o contrato da variante privada — PENDENTE DE DECISÃO

**Objetivo:** transformar as escolhas do DRS em contratos implementáveis antes do login, cofre e extensão.

**Decisões necessárias:**

1. Domínio oficial, TLS, proxy e relação entre origem da web, API e extensão.
2. Sessão “manter conectado”: cookie, duração técnica, validação por acesso sensível, dispositivo confiável, logout e revogação imediata. A experiência desejada não deve ser traduzida como sessão literalmente infinita.
3. 2FA do admin em navegador novo e recuperação em perda completa de acesso. TOTP e códigos de recuperação fora do Hub são recomendação do DRS, ainda sem aprovação final.
4. Banco, transações e trilha de auditoria para usuários, sessões, catálogo, bilhetes e credenciais. PostgreSQL é recomendação, não decisão fechada.
5. Cifragem do cofre, guarda separada da chave, rotação, backup cifrado e restauração ensaiada; procedimento para perda da chave.
6. Contrato do bilhete de abertura: usuário, serviço, tentativa, extensão, prazo curto, uso único e prevenção de replay.
7. Limite entre configuração pública reutilizável e catálogo/credenciais privados. Escolher se a variante SVA é uma instalação por empresa ou parte de um produto multiempresa.
8. Métrica de sucesso, serviços do piloto e quem pode validar cada fornecedor. PARTIU!, Fullcam e Playhub são apenas a seleção recomendada no DRS.

**Aceite para encerrar R2:** DRS com decisões, alternativas descartadas, fluxos, ameaças e critérios de aceite por recurso; perguntas correspondentes de `docs/OPEN_QUESTIONS.md` resolvidas ou explicitamente adiadas sem bloquear o próximo recorte. Não colocar credenciais reais no documento.

### R3 — Identidade, sessões e administração — PLANEJADO; DEPENDE DE R2

**Trabalho previsto:**

- Criar contas com usuário de exibição, e-mail único e senha inicial definida pelo admin; login por e-mail e senha, sem convite ou e-mail automático na V1.
- Guardar apenas hash apropriado da senha do Hub. Definir tentativa de login, erros, auditoria e limites de abuso conforme o desenho aprovado.
- Implementar papéis de admin/dev e atendente, sessão protegida, “manter conectado”, Sair e revogação por usuário/dispositivo.
- Exigir 2FA do admin em navegador novo conforme contrato de R2.
- Permitir redefinição assistida pelo admin após conferência operacional; redefinição invalida todas as sessões anteriores do atendente.

**Aceite:** acesso a rota privada sem sessão é negado no servidor; papel e identidade são conferidos por operação; revogação e redefinição impedem novo acesso imediatamente, inclusive em sessão persistente. Logs não contêm senha, cookie ou código 2FA.

### R4 — Cofre central e auditoria — PLANEJADO; DEPENDE DE R2 E R3

**Trabalho previsto:**

- Cifrar credenciais de SVA de modo reversível com chave protegida separadamente dos dados; versionar e rotacionar o esquema conforme decisão de R2.
- Vincular credencial individual ao atendente e credencial compartilhada ao serviço/equipe; não entregar o cofre inteiro ao cliente.
- Admin cadastra e atualiza as compartilhadas; atendente cadastra e atualiza somente as próprias individuais.
- Admin pode revelar individuais e compartilhadas para suporte; atendente revela apenas as próprias individuais. Compartilhadas ficam ocultas ao atendente no Hub.
- Registrar criação, alteração, revelação, revogação e falhas sem registrar valores secretos. Preparar backup e prova de restauração.

**Aceite:** testes de autorização cruzada, isolamento por dono, rotação, falha de chave e restauração. O controle de interface precisa corresponder à decisão da API. Não prometer sigilo absoluto depois que uma senha é preenchida no Chrome do usuário.

### R5 — Catálogo privado e jornadas do Hub — PLANEJADO; DEPENDE DE R3

**Trabalho previsto:**

- Servir cards e destinos autorizados pela API autenticada; todos os atendentes veem os mesmos cards no piloto, mantendo credenciais individuais isoladas.
- Mostrar Fullarm e CRM como cards normais sem ação até que tenham URL validada. Definir como o admin libera URL, estado ativo/inativo e mudanças de domínio.
- Abrir as três planilhas de consulta em nova aba sem solicitar credenciais do cofre. A permissão real continua no Google Sheets.
- Diferenciar extensão ausente, destino indisponível, sessão do Hub inválida e erro de abertura. Manter link/manual fallback quando apropriado.

**Aceite:** nenhum catálogo privado aparece sem sessão; nenhuma URL de SVA ou planilha privada é embutida na demonstração pública; card sem URL não abre aba; o Hub não declara autenticação no fornecedor apenas porque abriu o destino.

### R6 — Protocolo da extensão Chrome — PLANEJADO; DEPENDE DE R2, R3, R4 E R5

**Trabalho previsto:**

- Fixar origem oficial e ID estável da extensão; aceitar somente mensagens esperadas, de serviço conhecido e ação iniciada pelo usuário.
- Emitir e consumir bilhete limitado à tentativa; a extensão solicita apenas a credencial autorizada para o formulário reconhecido.
- Adicionar permissões por domínio aprovado, sem `*://*/*`, código remoto ou persistência de senha em texto claro.
- Tratar suspensão do service worker, repetição de mensagem, timeout e atualização da extensão sem reutilizar bilhete gasto.

**Aceite:** testes de origem falsa, serviço trocado, replay, expiração, revogação durante a tentativa e indisponibilidade. Nenhuma senha passa pelo React, por URL ou por log.

### R7 — Adaptadores e piloto por fornecedor — PILOTO; DEPENDE DE R6

**Sequência proposta, sujeita à aprovação em R2:** PARTIU! para conta compartilhada sem desafio visível; Fullcam para conta individual; Playhub para formulário com reCAPTCHA e 2FA humanos. IPTV pode vir depois para avaliar Turnstile. Demais SVAs entram após URL, inspeção e validação próprias.

**Critérios por serviço:**

1. Clique abre o destino correto e sessão válida chega ao dashboard sem novo login.
2. Formulário conhecido recebe somente a credencial do serviço e, se permitido, é enviado uma vez. Tela inesperada para a automação.
3. CAPTCHA, Turnstile quando exigir ação e 2FA permanecem com o atendente; não contornar desafios.
4. Falha de senha, desafio, timeout, extensão ausente e mudança de formulário produzem estados distintos, sem falsa confirmação.
5. Login manual continua possível. Resultado real é registrado por serviço, data, versão de extensão e condição observada, sem segredo ou dado de cliente.

**Aceite:** prova sintética para regressão e piloto autorizado em Chrome com conta adequada; não inferir compatibilidade de produção apenas da existência de campos de login na página pública.

### R8 — Operação on-premise e implantação — PLANEJADO; DEPENDE DE R2–R7

**Trabalho previsto:** confirmar capacidade do servidor, DNS, certificado TLS, proxy, armazenamento, chave, rotina de backup/restauração, monitoramento, atualização e rollback. Distribuir extensão Chrome manualmente sob controle do admin/dev no piloto, com ID estável e permissões revisadas. Definir procedimento de desligamento que inclui sessões e senhas nos próprios fornecedores.

**Aceite:** implantação reproduzível e recuperação ensaiada; domínio/origem conferidos no Chrome; revogação e indisponibilidade testadas; evidências do piloto distinguem API, extensão, fornecedor e ambiente. Publicação de portfólio e implantação privada têm destinos e provas separados.

### R9 — Fechamento do piloto e evolução — APÓS R8

Consolidar métricas acordadas em R2, falhas por serviço, tempo e intervenção humana necessários, incidentes e custo de manter adaptadores. Decidir expansão para os demais SVAs, Edge, distribuição gerenciada da extensão e modelo comercial de reutilização. Cada expansão exige contrato e validação específicos; não transformar um piloto aprovado em promessa universal de SSO.

## 4. Dependências e caminhos paralelos

```mermaid
flowchart LR
  R0[R0 Base entregue] --> R1[R1 Modelo público reutilizável]
  R0 --> R2[R2 Fechar DRS privado]
  R2 --> R3[R3 Identidade]
  R2 --> R4[R4 Cofre]
  R3 --> R4
  R3 --> R5[R5 Catálogo]
  R4 --> R6[R6 Extensão]
  R5 --> R6
  R6 --> R7[R7 Piloto por SVA]
  R7 --> R8[R8 Operação on-premise]
  R8 --> R9[R9 Evolução]
```

R1 pode avançar sem credenciais reais. R3–R6 só devem assumir as decisões fechadas em R2. Projeto público no GitHub não equivale a app publicado; build local não equivale a piloto ou produção.

## 5. Ponto de retomada da próxima sessão

1. Ler `AGENTS.md`, este roadmap, `docs/CONTEXT.md`, `docs/DECISIONS.md` e `docs/OPEN_QUESTIONS.md`; verificar `git status --short --branch`. Preservar alterações e runtime locais de outras ferramentas.
2. Escolher o próximo recorte: **R1**, para qualidade e modelo reutilizável, ou **R2**, para fechar as decisões da variante privada. Registrar a escolha sem misturar os dois escopos.
3. Em R1, começar por inspeção visual/funcional do navegador e definir o modelo por cliente. Em R2, resolver o bloco de decisões do DRS antes de selecionar banco, autenticação ou cofre.
4. Para qualquer feature, atualizar o README em inglês no mesmo trabalho. Registrar prova local, lacunas de navegador/fornecedor e próximo passo. Commits, quando solicitados, têm mensagem em inglês.

**Pendência documental conhecida:** `docs/CONTEXT.md` era anterior ao primeiro commit; esta rodada o sincroniza com o estado publicado. O DRS v0.37 continua rascunho e não foi copiado para o repositório público.
