export default function LeadProfileSection({ customer }) {
  if (!customer) return (
    <div style={{ padding: '16px', color: 'var(--g-400)', fontSize: 12 }}>
      Sem cliente associado
    </div>
  );

  const initial = (customer.name ?? customer.phone ?? '?')[0].toUpperCase();

  return (
    <div style={{ padding: '16px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--red)',
          color: 'var(--white)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {customer.name ?? '—'}
          </div>
          {customer.phone && (
            <div style={{ fontSize: 12, color: 'var(--g-500)' }}>
              {customer.phone}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {customer.email && (
          <Row label="E-mail" value={customer.email} />
        )}
        {customer.document && (
          <Row label="CPF/CNPJ" value={customer.document} />
        )}
        {customer.created_at && (
          <Row label="Cliente desde" value={new Date(customer.created_at).toLocaleDateString('pt-BR')} />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--g-400)', minWidth: 70 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--g-700)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
