import CrmScreen from '../screens/CRMScreen.jsx';

export default function CRM({ tenantDbId, userId, onNavigate, tenantSlug }) {
  return (
    <div style={{ margin: '-24px -28px' }}>
      <CrmScreen tenant={tenantSlug} tenantDbId={tenantDbId} onNavigate={onNavigate} />
    </div>
  );
}
