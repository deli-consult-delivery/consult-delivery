-- T5/G5: salva número WhatsApp do cliente na análise para notificações futuras.
ALTER TABLE analises ADD COLUMN IF NOT EXISTS numero_whatsapp_cliente TEXT;
