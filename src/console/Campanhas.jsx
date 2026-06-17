import { useState } from 'react';
import CampanhasDashboard from '../screens/campanhas/CampanhasDashboard.jsx';
import LojasList from '../screens/campanhas/LojasList.jsx';
import LojaForm from '../screens/campanhas/LojaForm.jsx';
import CampanhaForm from '../screens/campanhas/CampanhaForm.jsx';
import CampanhaGerando from '../screens/campanhas/CampanhaGerando.jsx';
import CampanhaRevisar from '../screens/campanhas/CampanhaRevisar.jsx';
import CampanhaAprovada from '../screens/campanhas/CampanhaAprovada.jsx';
import HistoricoCampanhas from '../screens/campanhas/HistoricoCampanhas.jsx';

export default function Campanhas({ tenantDbId, userId }) {
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
