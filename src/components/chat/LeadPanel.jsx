import LeadPanelHeader from './LeadPanelHeader.jsx';
import LeadProfileSection from './LeadProfileSection.jsx';
import LeadNotesSection from './LeadNotesSection.jsx';
import LeadAddressSection from './LeadAddressSection.jsx';
import ReopenButton from './ReopenButton.jsx';

export default function LeadPanel({ conversation, customer, tenantId, onClose, onReopened }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      <LeadPanelHeader
        conversation={conversation}
        onClose={onClose}
      />

      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <LeadProfileSection customer={customer} />

        <Divider />

        <LeadNotesSection
          customerId={customer?.id}
          tenantId={tenantId}
        />

        <Divider />

        <LeadAddressSection
          customerId={customer?.id}
          tenantId={tenantId}
        />

        {conversation?.status_v2 === 'closed' && (
          <>
            <Divider />
            <div style={{ padding: '12px 16px' }}>
              <ReopenButton
                conversation={conversation}
                onReopened={onReopened}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--g-100)', margin: '0 16px' }} />;
}
