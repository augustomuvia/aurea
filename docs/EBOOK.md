# Página de venda do AUREA Guide (`/ebook`)

Página privada (não divulgada) para vender o guia digital em PDF. O pagamento e a entrega acontecem no **checkout externo da Kursinha**; a AUREA não processa pagamentos nem entrega o ficheiro.

## Ativar

1. Aplique `supabase/migrations/20261010000300_ebook.sql` no SQL Editor do Supabase (uma vez).
2. (Recomendado) Na Vercel, defina `EBOOK_CHECKOUT_ALLOWED_HOSTS` com o domínio do checkout da Kursinha (ex.: `kursinha.com`; subdomínios incluídos). Sem esta variável aceita-se qualquer domínio `https://` válido.
3. Em **Admin → E-book**: cole o URL de checkout, reveja preço e textos, **Guardar rascunho** → **Pré-visualizar** → **Publicar rascunho** → **Ativar página**.

## Como funciona

- Tabela `ebook_page` (uma linha): `draft` (editado no admin), `published` (o que o público vê), `enabled`. Sem políticas RLS: só o servidor lê/escreve.
- `/ebook` só responde se a página estiver ativa, publicada e com checkout válido; caso contrário devolve 404 (controlo no servidor, sem cache: rota dinâmica e `revalidatePath` nas ações).
- O botão de compra aponta para `/ebook/comprar`, que lê o URL publicado no servidor e redireciona (303). Nenhum parâmetro do navegador altera o destino ou o preço.
- Regressar à página depois de pagar não regista nenhuma compra.
- `/ebook/pre-visualizar` mostra o rascunho (ou `?versao=publicada`) apenas ao super admin, mesmo com a página desativada.
- Imagens (capa e pré-visualizações) vão para o bucket público `ebook-media` (PNG/JPG/WebP até 3 MB, validados pelo conteúdo). **O PDF do guia não deve ser carregado aqui.**
- Sem ligações a partir do site e com `noindex` (meta + cabeçalho `X-Robots-Tag`). Isto não garante confidencialidade absoluta: quem tiver o endereço abre a página enquanto estiver ativa.
- **Eliminar configuração** apaga a linha e as imagens; a página fica desativada.
- Todas as ações ficam na auditoria (`ebook.*`).
