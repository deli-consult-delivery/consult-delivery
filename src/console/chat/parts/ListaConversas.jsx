/**
 * ListaConversas — coluna 1 do Chat ao Vivo (cv2 redesign / FASE 1)
 *
 * Campo de busca + barra de contadores (<StatusCounters/>) + lista de
 * <ConvItem/>. Consome diretamente o contrato do hook useConversas.
 *
 * Props (vindas do useConversas + container):
 *  - convsFiltradas: convShape[]
 *  - loading: boolean
 *  - contadores, filtro, setFiltro, FILTROS  → barra de contadores
 *  - busca, setBusca                          → campo de busca
 *  - activeId: string|null                    → conversa selecionada
 *  - onSelect: (convId) => void
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import StatusCounters from './StatusCounters.jsx';
import ConvItem from './ConvItem.jsx';

export default function ListaConversas({
  convsFiltradas,
  loading,
  contadores,
  filtro,
  setFiltro,
  FILTROS,
  busca,
  setBusca,
  buscandoServer,
  activeId,
  onSelect,
  favMute,
}) {
  const lista = convsFiltradas || [];
  const fm = favMute || {};

  return (
    <div className="ccv-col1">
      <div className="ccv-search-wrap">
        <input
          className="ccv-search"
          placeholder="Buscar conversa…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar conversa"
        />
      </div>

      <StatusCounters
        contadores={contadores}
        filtro={filtro}
        setFiltro={setFiltro}
        FILTROS={FILTROS}
      />

      <div className="ccv-list">
        {loading && <div className="ccv-empty">Carregando conversas…</div>}

        {!loading && buscandoServer && <div className="ccv-hist">Buscando…</div>}

        {!loading && lista.length === 0 && (
          <div className="ccv-empty">
            {busca ? 'Nenhum resultado.' : 'Nenhuma conversa neste filtro.'}
          </div>
        )}

        {!loading && lista.map((c) => (
          <ConvItem
            key={c.id}
            conv={c}
            ativo={c.id === activeId}
            onClick={() => onSelect(c.id)}
            fav={fm.isFav ? fm.isFav(c.id) : false}
            muted={fm.isMuted ? fm.isMuted(c.id) : false}
            onToggleFav={() => fm.toggleFav?.(c.id)}
            onToggleMute={() => fm.toggleMute?.(c.id)}
          />
        ))}
      </div>
    </div>
  );
}
