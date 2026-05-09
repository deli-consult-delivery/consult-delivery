import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', padding: 32, background: '#0D0D0D', color: '#fff', fontFamily: 'sans-serif',
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Algo deu errado</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 24, textAlign: 'center', maxWidth: 480 }}>
            {msg}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#B70C00', color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
          <details style={{ marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.4)', maxWidth: 600, wordBreak: 'break-all' }}>
            <summary style={{ cursor: 'pointer' }}>Detalhes técnicos</summary>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{this.state.error?.stack}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
