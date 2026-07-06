import { useState } from 'react';
import LojasListView from '../screens/lojas/LojasListView.jsx';
import LojaWorkspace from '../screens/lojas/LojaWorkspace.jsx';

export default function Lojas({ tenantDbId, userId, allowedModules }) {
  const [view, setView] = useState('list');
  const [params, setParams] = useState({});

  function go(v, p = {}) { setView(v); setParams(p); }

  switch (view) {
    case 'workspace': return <LojaWorkspace tenantDbId={tenantDbId} userId={userId} go={go} lojaId={params.lojaId} allowedModules={allowedModules} />;
    default:          return <LojasListView tenantDbId={tenantDbId} userId={userId} go={go} />;
  }
}
