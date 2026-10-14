# Perguntas para o próximo incremento

1. Qual domínio oficial, TLS e topologia de proxy/API no servidor on-premise? A origem precisa ser fixa para a extensão.
2. Como representar “manter conectado” em cookie e sessão persistida, com revogação por dispositivo e expiração técnica documentada?
3. Qual método de 2FA para admin em navegador novo e como registrar dispositivo confiável sem reduzir a revogação?
4. Qual banco e modelo transacional para usuários, sessões, catálogo, bilhetes, auditoria e credenciais?
5. Como cifrar o cofre, separar/rotacionar chaves, fazer backup e testar restauração? Qual procedimento de perda da chave?
6. Qual contrato exato do bilhete de abertura: vínculo com usuário, serviço, extensão, tentativa, TTL e uso único?
7. Quais URLs de Fullarm/CRM, caminhos e sinais de dashboard dos demais SVAs? Quais formulários permitem envio automático no piloto controlado?
8. Qual métrica e conjunto de SVAs para o piloto? O DRS recomenda PARTIU!, Fullcam e Playhub, mas ainda não aprova essa seleção.

Não substitua essas respostas por defaults silenciosos na implementação.
