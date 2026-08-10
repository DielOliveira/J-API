# J-API — Instruções para agentes

## Escopo

- Este repositório contém o serviço local de envio por WhatsApp.
- Trabalhe somente neste repositório e na instalação própria do J-API em produção.
- A aplicação consumidora é um projeto separado. Não leia nem modifique esse projeto sem autorização explícita do usuário.

## Contexto operacional

- Se `OPERATIONS.local.md` existir, leia-o completamente antes de qualquer operação de deploy, VPS, GitHub, systemd, QR ou diagnóstico de produção.
- `OPERATIONS.local.md` e `.env` são deliberadamente ignorados pelo Git e podem conter detalhes privados da infraestrutura.
- Não copie informações desses arquivos para commits, logs públicos, issues ou pull requests.

## Segurança

- Nunca versionar `.env`, dados de sessão, QR Codes ou credenciais do WhatsApp.
- O serviço deve permanecer ligado exclusivamente em `127.0.0.1`.
- Não apagar sessões diante de falhas temporárias.
- Antes de publicar, confirmar com `git status --short --ignored` que arquivos locais e `data/sessions/` continuam ignorados.

## Validação

```bash
npm run check
npm audit --omit=dev
```
