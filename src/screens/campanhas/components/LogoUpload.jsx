import { useState, useRef } from 'react';
import { supabase } from '../../../lib/supabase.js';
import Icon from '../../../components/Icon.jsx';

export default function LogoUpload({ value, onUpload }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/svg+xml'].includes(file.type)) {
      alert('Formato inválido. Use JPG, PNG ou SVG.'); return;
    }
    setUploading(true); setProgress(0);
    const path = `lojas/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from('logos-lojas').upload(path, file, {
      cacheControl: '3600', upsert: false,
    });
    if (error) { alert('Erro no upload: ' + error.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('logos-lojas').getPublicUrl(data.path);
    onUpload(publicUrl);
    setUploading(false);
  }

  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        width:120, height:120, borderRadius:12,
        border:'2px dashed #2a2a2a',
        display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer', overflow:'hidden', background:'#151515',
        position:'relative',
      }}
    >
      {value ? (
        <img src={value} alt="Logo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, color:'#9ca3af' }}>
          <Icon name="upload" size={24} />
          <span style={{ fontSize:11 }}>Upload logo</span>
        </div>
      )}
      {uploading && (
        <div style={{
          position:'absolute', inset:0, background:'rgba(0,0,0,0.7)',
          display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:6,
        }}>
          <div style={{ width:80, height:4, background:'#2a2a2a', borderRadius:2, overflow:'hidden' }}>
            <div style={{ width:`${progress}%`, height:'100%', background:'#e63946', transition:'width .2s' }} />
          </div>
          <span style={{ fontSize:11, color:'#fff' }}>Enviando...</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.svg" style={{ display:'none' }}
        onChange={e => { handleFile(e.target.files[0]); e.target.value=''; }} />
    </div>
  );
}
