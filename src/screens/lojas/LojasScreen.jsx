import { useState } from 'react';
import LojasListView from './LojasListView.jsx';
import LojaWorkspace from './LojaWorkspace.jsx';

export default function LojasScreen({ tenantDbId, userId }) {
  const [view, setView] = useState('list');
  const [params, setParams] = useState({});

  function go(v, p = {}) { setView(v); setParams(p); }

  switch (view) {
    case 'workspace': return <LojaWorkspace tenantDbId={tenantDbId} userId={userId} go={go} lojaId={params.lojaId} />;
    default:          return <LojasListView tenantDbId={tenantDbId} userId={userId} go={go} />;
  }
}
