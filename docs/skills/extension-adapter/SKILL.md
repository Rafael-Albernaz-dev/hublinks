# Alterar adaptador de SVA

Use este procedimento ao criar ou modificar um adaptador da extensão para um fornecedor.

1. Leia `AGENTS.md`, o DRS, `docs/ARCHITECTURE.md` e o estado das perguntas abertas. Confirme que o domínio e o serviço foram autorizados.
2. Registre URL de entrada, redirecionamentos, host permitido, formulário, dashboard, CAPTCHA/2FA e estado de falha observados. Separe observação pública, teste sintético e piloto autenticado.
3. Peça somente a permissão de host necessária no Manifest V3. Não aceite código remoto nem correspondência ampla de domínios.
4. Valide origem da mensagem, serviço e tentativa; obtenha uma credencial apenas após autorização no backend. Nunca a exponha ao React, grave em storage ou imprima em logs.
5. Faça no máximo um envio automático em formulário reconhecido. Pause em CAPTCHA/2FA e falhe visivelmente em tela inesperada. Preserve login manual.
6. Verifique build/typecheck e prova focal com dados sintéticos. Piloto real exige autorização, conta própria e resultado observado no fornecedor. Registre o limite da prova.
