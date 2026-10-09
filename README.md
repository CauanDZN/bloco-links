# Bloco de links

Um bloco de notas online com uma única função: cole um link, dê espaço (ou Enter) e ele vira clicável.
O texto fica salvo no navegador (`localStorage`), então volta quando você reabre a página.

Clicar num link abre na **mesma aba** (de propósito: navegadores embutidos, como o do Rave, costumam ignorar `target="_blank"`).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000.

## Deploy (Vercel)

Pela CLI, direto desta pasta:

```bash
npx vercel
npx vercel --prod
```

Ou suba a pasta para um repositório no GitHub e importe em https://vercel.com/new. Não precisa de variável de ambiente nem de configuração.

## Estrutura

- `app/Editor.tsx`: o editor (div `contentEditable` + auto-link).
- `app/page.tsx`: renderiza o editor.
- `app/layout.tsx` e `app/globals.css`: casca da página e estilo (claro/escuro automático).
