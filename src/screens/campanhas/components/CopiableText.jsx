import { useState } from 'react';
import Icon from '../../../components/Icon.jsx';

export default function CopiableText({ text }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  return (
    <div style={{ position:'relative' }}>
      <pre style={{
        whiteSpace:'pre-wrap', wordBreak:'break-word',
        background:'#111', border:'1px solid #2a2a2a', borderRadius:8,
        padding:16, fontSize:14, lineHeight:1.6, color:'#fff',
        fontFamily:'Inter, sans-serif', margin:0,
      }}>
        {text}
      </pre>
      <button onClick={handleCopy} style={{
        position:'absolute', top:8, right:8,
        background:'#1a1a1a', border:'1px solid #2a2a2a',
        color:'#fff', borderRadius:6, padding:'6px 10px',
        fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
      }}>
        <Icon name={copied ? 'check' : 'clipboard'} size={14} />
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}
