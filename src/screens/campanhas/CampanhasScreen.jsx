import { useState } from 'react';
import CampanhasDashboard from './CampanhasDashboard.jsx';
import LojasList from './LojasList.jsx';
import LojaForm from './LojaForm.jsx';
import CampanhaForm from './CampanhaForm.jsx';
import CampanhaGerando from './CampanhaGerando.jsx';
import CampanhaRevisar from './CampanhaRevisar.jsx';
import CampanhaAprovada from './CampanhaAprovada.jsx';
import HistoricoCampanhas from './HistoricoCampanhas.jsx';

export default function CampanhasScreen({ tenantDbId, userId }) {
  const [view, setView] = useState('dashboard');
  const [params, setParams] = useState({});

  function go(v, p = {}) { setView(v); setParams(p); }

  const shared = { tenantDbId, userId, go, params };

  switch (view) {
    case 'dashboard':    return <CampanhasDashboard {...shared} />;
    case 'lojas':          return <LojasList {...shared} />;
    case 'loja-nova':      return <LojaForm {...shared} mode="create" />;
    case 'loja-editar':    return <LojaForm {...shared} mode="edit" slug={params.slug} />;
    case 'nova':           return <CampanhaForm {...shared} />;
    case 'gerando':        return <CampanhaGerando {...shared} id={params.id} />;
    case 'revisar':        return <CampanhaRevisar {...shared} id={params.id} />;
    case 'aprovada':       return <CampanhaAprovada {...shared} id={params.id} />;
    case 'historico':      return <HistoricoCampanhas {...shared} />;
    default:               return <CampanhasDashboard {...shared} />;
  }
}
