-- Dados iniciais de configuração (não são dados de demonstração).
-- Preços em cêntimos de kwanza: 5.000 Kz = 500000.

insert into public.plans (code, name, description, amount_minor, duration_months, features, is_highlighted, sort_order) values
  ('mensal', 'Mensal', 'Flexibilidade total, mês a mês.', 500000, 1,
   array['Acesso à biblioteca premium', 'Reprodução dos conteúdos disponíveis', 'Pesquisa e filtros', 'Favoritos', 'Histórico de reprodução', 'Retoma de conteúdos', 'Utilização em dispositivos compatíveis'], false, 1),
  ('trimestral', 'Trimestral', 'Três meses para criar uma rotina.', 1200000, 3,
   array['Acesso à biblioteca premium', 'Reprodução dos conteúdos disponíveis', 'Pesquisa e filtros', 'Favoritos', 'Histórico de reprodução', 'Retoma de conteúdos', 'Utilização em dispositivos compatíveis'], false, 2),
  ('anual', 'Anual', 'Um ano inteiro de equilíbrio.', 3000000, 12,
   array['Acesso à biblioteca premium', 'Reprodução dos conteúdos disponíveis', 'Pesquisa e filtros', 'Favoritos', 'Histórico de reprodução', 'Retoma de conteúdos', 'Utilização em dispositivos compatíveis'], true, 3)
on conflict (code) do nothing;

insert into public.categories (slug, name, description, kind, sort_order) values
  ('relaxamento', 'Relaxamento', 'Paisagens sonoras para abrandar o ritmo.', 'purpose', 1),
  ('meditacao', 'Meditação', 'Ambientes para acompanhar a prática de atenção plena.', 'purpose', 2),
  ('concentracao', 'Concentração', 'Som contínuo e discreto para trabalho profundo.', 'purpose', 3),
  ('sono', 'Sono e descanso', 'Experiências longas e suaves para o fim do dia.', 'purpose', 4),
  ('natureza', 'Sons da natureza', 'Chuva, mar, floresta e vento.', 'ambient', 5),
  ('ambientes', 'Ambientes sonoros', 'Texturas e drones para criar espaço.', 'ambient', 6),
  ('frequencias', 'Frequências de referência', 'Conteúdos identificados por frequência declarada: 174, 396, 432, 528, 639 Hz.', 'frequency', 7),
  ('binaurais', 'Experiências binaurais', 'Conteúdos binaurais devidamente identificados. Use auscultadores.', 'frequency', 8)
on conflict (slug) do nothing;

insert into public.platform_settings (key, value, is_public) values
  ('brand', '{"name": "AUREA", "slogan": "Encontre o seu estado de equilíbrio.", "logo_url": null}', true),
  ('support', '{"email": null, "phone": null, "whatsapp": null, "hours": null}', true),
  ('announcement', '{"active": false, "message": ""}', true),
  ('maintenance', '{"enabled": false, "message": "Estamos a fazer melhorias. Voltamos em breve."}', true),
  ('payment', '{"mode": "manual_review", "mcx_recipient_name": null, "mcx_recipient_phone": null, "instructions": null}', true),
  ('email', '{"from_name": "AUREA", "from_email": null, "send_payment_emails": true}', false),
  ('legal', '{"company_name": null, "nif": null, "address": null, "terms_updated_at": "2026-10-10", "privacy_updated_at": "2026-10-10"}', true)
on conflict (key) do nothing;
