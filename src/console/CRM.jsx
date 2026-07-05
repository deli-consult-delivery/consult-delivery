import CrmScreen from '../screens/CRMScreen.jsx';

export default function CRM({ tenantDbId, userId, onNavigate, tenantSlug, tenantNome }) {
  return (
    <div style={{ margin: '-24px -28px' }}>
      <CrmScreen tenant={tenantSlug} tenantNome={tenantNome} tenantDbId={tenantDbId} onNavigate={onNavigate} />
    </div>
  );
}
