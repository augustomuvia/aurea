# Operações, backups e monitorização

- **Backups**: Supabase faz backups diários (plano Pro: Point-in-Time Recovery). Fazer também uma exportação semanal (`supabase db dump`) para armazenamento externo cifrado. Testar a reposição trimestralmente num projeto separado.
- **Monitorização de erros**: registos da Vercel (Runtime Logs) e do Supabase (Logs Explorer). As páginas de erro mostram um código (`digest`) para cruzar com os registos. Pode adicionar-se Sentry mais tarde.
- **Auditoria**: `admin_audit_logs` e `payment_events` são append-only. Rever em **Admin → Auditoria**.
- **Dados pessoais**: exportação pelo próprio utilizador em **Conta → Exportar dados**; encerramento de conta elimina perfil, favoritos, histórico e preferências, mantendo registos de pagamento anonimizados.
- **Incidentes**: suspender a conta afetada (termina sessões), rever auditoria, rodar `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` se houver suspeita de fuga.
