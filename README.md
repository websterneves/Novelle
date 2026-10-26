# Novelle Semijoias

Vitrine pública + painel admin (Node, Express, MySQL, EJS).

## Rodando
1. `cp .env.example .env` e preencha DB_*, ADMIN_USER, ADMIN_PASS e WHATSAPP (com DDI, ex.: 5511999999999)
2. `npm install`
3. `npm run seed`  (cria o banco/tabelas e importa as 162 peças dos catálogos; pode rodar de novo sem duplicar)
4. `npm start`

- Vitrine: http://localhost:3000 (mostra só itens ativos)
- Admin: http://localhost:3000/admin (login por Basic Auth do .env)

Fotos novas enviadas no admin ficam em `public/uploads/`.
