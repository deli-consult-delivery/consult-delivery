import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import AprovacaoPublica from './screens/publico/AprovacaoPublica.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// GitHub Pages SPA redirect: /?p=aprovacao/<token> → /aprovacao/<token>
const _sp = new URLSearchParams(window.location.search);
const _rp = _sp.get('p');
if (_rp) {
  window.history.replaceState(null, '', '/' + _rp);
}

const _isPublicAprovacao = window.location.pathname.startsWith('/aprovacao/');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {_isPublicAprovacao ? <AprovacaoPublica /> : <App />}
    </ErrorBoundary>
  </StrictMode>
);
