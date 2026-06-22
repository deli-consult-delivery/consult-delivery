import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import AprovacaoPublica from './screens/publico/AprovacaoPublica.jsx';
import AvaliacaoPublica from './screens/publico/AvaliacaoPublica.jsx';
import OnboardingWizard from './screens/publico/OnboardingWizard.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// GitHub Pages SPA redirect: /?p=aprovacao/<token> → /aprovacao/<token>
const _sp = new URLSearchParams(window.location.search);
const _rp = _sp.get('p');
if (_rp) {
  window.history.replaceState(null, '', '/' + _rp);
}

const _path = window.location.pathname;
const _isPublicAprovacao = _path.startsWith('/aprovacao/');
const _isPublicAvaliacao = _path.startsWith('/avaliacao/');
const _isPublicWizard    = _path === '/comecar' || _path === '/comecar/';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {_isPublicAprovacao ? <AprovacaoPublica />
        : _isPublicAvaliacao ? <AvaliacaoPublica />
        : _isPublicWizard ? <OnboardingWizard />
        : <App />}
    </ErrorBoundary>
  </StrictMode>
);
