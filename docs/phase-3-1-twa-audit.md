# Raqueteia — Fase 3.1: Preparação TWA (Google Play)

Data: 2026-11-02. Escopo: auditoria e correções seguras. Sem AAB, sem chaves de assinatura, sem publicação na Play, sem alteração de dados esportivos.

## 1. Diagnóstico de compatibilidade TWA

| Item | Estado | Observação |
|---|---|---|
| Manifest PWA | OK | `public/manifest.json`: id `/`, name/short_name `Raqueteia`, start_url `/?source=pwa&android_assets=v6`, scope `/`, display `standalone` (override fullscreen/minimal-ui), orientation `portrait`, theme/background `#000000` |
| Ícones | OK | 192px e 512px, versões `any` e `maskable` (v7), servidos de `public/` |
| Service Worker | OK | `public/sw.js`: fetch pass-through (não intercepta OAuth), push + notificationclick com foco/navegação de janela existente |
| Splash | OK | Tela de startup no shell raiz com ícone do manifesto + barra indeterminada; sem splash duplicada (TWA mostra a splash nativa gerada do manifesto e o app assume sem delay mínimo) |
| Tela cheia / safe areas | OK | `viewport-fit=cover`, `env(safe-area-inset-*)` em styles.css e componentes |
| Deep links | OK | Rotas absolutas (`/invite/:code`, `/excluir-conta`, etc.) sob scope `/`; push só abre URLs internas (push-url.test.ts) |
| Offline | Parcial | Sem cache offline por decisão de projeto (SW pass-through). TWA exibe a página de erro do Chrome sem conexão. Aceitável para a Play; documentado |
| Permissões/notificações | OK | Web Push com VAPID; 6 assinaturas ativas; ações inline de admin (Aprovar/Recusar) |
| Login Google | OK com ressalva | Ver seção 4 |
| Exclusão de conta e Privacidade | OK | `/excluir-conta` (pública, com Google OAuth) e `/privacidade` acessíveis sem login — exigência da Play atendida |

## 2. Problemas identificados

1. **assetlinks.json apontava para `app.rankmymatch`** (identificador antigo) com fingerprint de certificado antigo — associação inválida para o app futuro. **Corrigido nesta fase** (ver seção 3).
2. **Fingerprint SHA-256 de `app.raqueteia` ainda não existe** — depende do certificado do Google Play App Signing, que só é gerado após criar o app no Play Console. Pendência documentada (seção 5).
3. **Sem suporte offline** — decisão consciente; sem ação.
4. **Botão Voltar do Android**: a navegação interna usa histórico do router; na TWA o Voltar percorre o histórico e fecha o app na raiz — comportamento padrão adequado. Nenhuma correção necessária.

## 3. Correções seguras implementadas

- `public/.well-known/assetlinks.json` substituído por lista vazia `[]`, removendo a associação falsa com `app.rankmymatch`. O arquivo permanece no ar (HTTP 200) pronto para receber a entrada definitiva de `app.raqueteia` quando o fingerprint do Play App Signing existir. Nenhuma associação incompleta foi publicada.

## 4. Estado do login Google

- `redirect_uri` usa `window.location.origin` (ou a URL do convite) — nenhuma dependência do domínio antigo no código (verificado por busca em `src/` e `public/`).
- Em TWA, o OAuth abre em Chrome Custom Tab e retorna ao app; a sessão persiste porque a TWA compartilha o armazenamento do Chrome.
- Cancelamento de login: o fluxo retorna à tela de entrada sem erro fatal (LandingPage trata o retorno).
- **Pendência de validação em dispositivo físico** após gerar o AAB (Fase 3.2+): login completo, retorno do Custom Tab e persistência de sessão.
- Nenhuma credencial OAuth foi alterada.

## 5. Estado do Digital Asset Links

- Arquivo servido em `https://raqueteia.app/.well-known/assetlinks.json` (HTTP 200, JSON válido, atualmente `[]`).
- Entrada definitiva a adicionar quando o certificado existir:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.raqueteia",
      "sha256_cert_fingerprints": ["<SHA-256 do certificado do Play App Signing>"]
    }
  }
]
```

- O fingerprint correto é obtido em Play Console → Configuração → Integridade do app → App Signing (certificado de assinatura do app). Não usar o fingerprint de upload key local se o Play App Signing estiver ativo.

## 6. Estratégia recomendada para gerar o Android (Fase 3.2, não iniciada)

**Ferramenta: Bubblewrap (CLI oficial do Google para TWA).**

1. Requisitos locais (máquina do proprietário, não o ambiente Lovable): Node.js LTS, JDK 17, Android SDK (cmdline-tools), `@bubblewrap/cli`.
2. `bubblewrap init --manifest https://raqueteia.app/manifest.json` — gera o projeto Android com package `app.raqueteia`, start URL `https://raqueteia.app/`.
3. Assinatura: gerar keystore de upload local (fora do Lovable); ativar **Google Play App Signing** no primeiro upload — o Google guarda a chave de assinatura definitiva.
4. `bubblewrap build` → gera o AAB assinado com a upload key.
5. Copiar o fingerprint SHA-256 do **App Signing certificate** do Play Console para `assetlinks.json` e republicar o site.
6. Validação: `bubblewrap validate` + teste em dispositivo físico via track interno.
7. Testes em dispositivo físico: login Google ida e volta, push com app fechado, botão Voltar, abertura por link `https://raqueteia.app/...` (deve abrir no app, não no navegador), compartilhamento, teclado em formulários de placar.

Alternativa: PWABuilder (gera o pacote via web) — mais simples, menos controle. Bubblewrap é a recomendação por ser a ferramenta oficial mantida pelo Google.

## 7. Testes executados

- 32 testes automatizados passando (analytics, push-url, account-deletion, theme, game-reminder, e-mail de infraestrutura).
- Nenhum dado esportivo, ranking ou partida foi alterado.

## 8. Pendências que exigem intervenção do proprietário

1. Publicar esta versão (assetlinks.json limpo).
2. Criar o app no Play Console com o pacote `app.raqueteia` (identificador definitivo; `app.rankmymatch` não será reutilizado).
3. Ativar o Play App Signing e gerar/enviar a upload key localmente (nunca no Lovable).
4. Fornecer o fingerprint SHA-256 do App Signing para completar o assetlinks.json.
5. Instalar Node/JDK/Android SDK na máquina local para o Bubblewrap.
6. Conta Google Play Developer ativa (US$ 25 únicos) e Data Safety revisado com bimbapps@gmail.com.

## 9. Checklist para a Fase 3.2

- [ ] assetlinks.json com fingerprint real publicado e validado (Play Console + ferramenta de verificação de Digital Asset Links)
- [ ] Projeto Bubblewrap gerado com `app.raqueteia`
- [ ] Keystore de upload criado e guardado com backup seguro
- [ ] AAB gerado e assinado
- [ ] Play App Signing ativado
- [ ] Teste em track interno com dispositivo físico (login, push, Voltar, deep links)
- [ ] Data Safety, classificação etária, ícone 512, feature graphic 1024x500, screenshots
- [ ] Política de Privacidade e página de exclusão vinculadas na ficha da loja
