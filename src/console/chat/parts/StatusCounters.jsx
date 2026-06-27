/**
 * StatusCounters — barra de contadores por estado (cv2 redesign / FASE 1)
 *
 * Renderiza um chip clicável por filtro (FILTROS do engine). Cada chip mostra
 * o ícone semântico (<Ico/>), o label e o número (contadores[f.id]). O chip
 * ativo (filtro === f.id) recebe .on; a tonalidade vem de f.tone (.t-red/.t-amber/
 * .t-green/.t-tx2). Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 *
 * Props:
 *  - contadores: { [id]: number }
 *  - filtro: string (id ativo)
 *  - setFiltro: (id) => void
 *  - FILTROS: Array<{ id, label, ico, tone, sv2 }>
 */

import { Ico } from '../../CvIcons.jsx';

export default function StatusCounters({ contadores, filtro, setFiltro, FILTROS }) {
  const lista = FILTROS || [];
  return (
    <div className="ccv-counters" role="tablist" aria-label="Filtrar conversas por estado">
      {lista.map((f) => {
        const ativo = filtro === f.id;
        const n = contadores?.[f.id] ?? 0;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={ativo}
            title={f.label}
            className={`ccv-counter t-${f.tone}${ativo ? ' on' : ''}`}
            onClick={() => setFiltro(f.id)}
          >
            <Ico name={f.ico} size={13} />
            <span className="ccv-cn">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
