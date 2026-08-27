# Site — Gestão de Treinamentos (para GitHub Pages)

Este é o frontend estático do sistema: HTML, CSS e JS puros, sem nenhuma dependência de build (sem npm, sem framework). Fala com o backend (Google Apps Script, publicado como API) só por `fetch()`.

## Antes de subir para o GitHub

1. Publique o backend (pasta `backend/` do pacote principal) como Web App no Apps Script — veja o manual de instalação.
2. Abra `api-config.js` e cole a URL da API na variável `window.API_URL` (termina em `/exec`).
3. (Opcional) Troque os ícones em `icons/` pela identidade visual real da empresa, mantendo os mesmos nomes de arquivo e tamanhos.

## Subir para o GitHub Pages

```bash
git init
git add .
git commit -m "Sistema de Gestão de Treinamentos"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

No repositório, vá em **Settings → Pages → Build and deployment → Source: Deploy from a branch**, selecione a branch `main` e a pasta `/ (root)`. Em 1-2 minutos o site fica disponível em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

**Importante:** o arquivo `.nojekyll` (já incluso, vazio) precisa continuar na raiz do site publicado — sem ele, o GitHub Pages processa tudo com Jekyll e ignora arquivos/pastas que começam com ponto, como `.well-known/assetlinks.json` (necessário mais tarde para o app Android/TWA).

## Testando localmente antes de subir

Não abra `index.html` direto no navegador com `file://` — o Service Worker e o `fetch()` para a API exigem `http(s)://`. Rode um servidor local simples:

```bash
cd site
python3 -m http.server 8080
```

E acesse `http://localhost:8080`.

## Estrutura

```
site/
├── index.html          shell da aplicação (todas as telas)
├── style.css            estilo (paleta industrial, responsivo)
├── app.js                lógica do cliente (fetch para a API, todas as telas)
├── api-config.js        ÚNICO arquivo que você edita: URL da API
├── manifest.json        PWA — instalar como app
├── service-worker.js    cache offline do shell do app
├── icons/                ícones do PWA em vários tamanhos
├── .well-known/
│   └── assetlinks.json  usado depois, ao publicar na Google Play (TWA)
└── .nojekyll             desativa o processamento Jekyll do GitHub Pages
```
