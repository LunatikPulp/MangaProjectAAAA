import React, { useState, useContext } from 'react';
import { useEditSuggestions } from '../../hooks/useEditSuggestions';
import { MangaContext } from '../../contexts/MangaContext';
import { EditSuggestion, Manga, MangaFormData } from '../../types';

const DiffViewer: React.FC<{ original: Manga, suggestion: MangaFormData }> = ({ original, suggestion }) => {
  const fields: (keyof MangaFormData)[] = ['title', 'description', 'year', 'type', 'status', 'cover', 'genres'];

  const changes = fields.filter(field => {
    if (field === 'genres') {
      return JSON.stringify(original[field].sort()) !== JSON.stringify(suggestion[field].sort());
    }
    return original[field as keyof Manga] !== suggestion[field];
  });

  if (changes.length === 0) return <div className="font-code text-[11px]" style={{ color: '#7a7060' }}>НЕТ ИЗМЕНЕНИЙ</div>;

  return (
    <div className="space-y-2">
      {changes.map(field => (
        <div key={String(field)}>
          <div className="font-terminal text-[12px] mb-1" style={{ color: '#9b8c3b' }}>{String(field).toUpperCase()}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded" style={{ background: 'rgba(122,22,22,0.08)', border: '1px solid rgba(122,22,22,0.15)' }}>
              <div className="font-code text-[10px] line-through" style={{ color: '#7a1616' }}>{String(original[field as keyof Manga])}</div>
            </div>
            <div className="p-2 rounded" style={{ background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.12)' }}>
              <div className="font-code text-[10px]" style={{ color: '#39ff14' }}>{String(suggestion[field])}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const SuggestionsPage: React.FC = () => {
  const { suggestions, approveSuggestion, rejectSuggestion } = useEditSuggestions();
  const { getMangaById, updateManga } = useContext(MangaContext);
  const [selectedSuggestion, setSelectedSuggestion] = useState<EditSuggestion | null>(null);

  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const resolvedSuggestions = suggestions.filter(s => s.status !== 'pending');
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');

  const handleApprove = () => {
    if (!selectedSuggestion) return;
    updateManga(selectedSuggestion.mangaId, selectedSuggestion.data);
    approveSuggestion(selectedSuggestion.id);
    setSelectedSuggestion(null);
  };

  const handleReject = () => {
    if (!selectedSuggestion) return;
    rejectSuggestion(selectedSuggestion.id);
    setSelectedSuggestion(null);
  };

  const originalManga = selectedSuggestion ? getMangaById(selectedSuggestion.mangaId) : null;

  const display = tab === 'pending' ? pendingSuggestions : resolvedSuggestions;

  return (
    <div>
      <div className="mb-5">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          ПРЕДЛОЖЕННЫЕ ПРАВКИ
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/night-staff/suggestions</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>diff --review</span>
        </div>
      </div>

      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid #2a2420' }}>
        {(['pending', 'resolved'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="font-terminal text-[14px] tracking-[1px] px-4 py-2"
            style={{
              color: tab === t ? '#d4c8b0' : '#8a8070',
              background: tab === t ? 'rgba(90, 102, 56, 0.1)' : 'transparent',
              borderBottom: tab === t ? '2px solid #5a6638' : '2px solid transparent',
              cursor: 'pointer',
              border: 'none',
              borderBottomWidth: '2px',
              borderBottomStyle: 'solid',
              borderBottomColor: tab === t ? '#5a6638' : 'transparent',
            }}
          >
            {t === 'pending' ? 'ОЖИДАЮТ' : 'РЕШЁННЫЕ'}
            {t === 'pending' && pendingSuggestions.length > 0 && (
              <span className="ml-1.5 font-code text-[11px] px-1.5 py-0.5 rounded-sm" style={{ background: 'rgba(122, 22, 22, 0.15)', color: '#7a1616' }}>
                {pendingSuggestions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {display.length === 0 ? (
        <div className="springos-metal-frame rounded p-10 text-center">
          <div className="relative z-10">
            <div className="font-terminal text-[20px]" style={{ color: '#7a7060' }}>НЕТ ПРАВОК</div>
            <div className="font-code text-[10px] mt-2" style={{ color: '#1e1a16' }}>
              КОГДА ПОЛЬЗОВАТЕЛИ ПРЕДЛОЖАТ ИЗМЕНЕНИЯ, ОНИ ПОЯВЯТСЯ ЗДЕСЬ
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
          <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
            <thead>
              <tr>
                <th>ТАЙТЛ</th>
                <th>ОТПРАВИТЕЛЬ</th>
                <th>ДАТА</th>
                <th style={{ width: 120 }}>ДЕЙСТВИЕ</th>
              </tr>
            </thead>
            <tbody>
              {display.map(s => (
                <tr key={s.id}>
                  <td className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>{s.mangaTitle}</td>
                  <td className="font-code text-[12px]" style={{ color: '#9a9080' }}>{s.suggestedBy}</td>
                  <td className="font-code text-[11px]" style={{ color: '#7a7060' }}>
                    {new Date(s.timestamp).toLocaleString('ru-RU')}
                  </td>
                  <td>
                    {s.status === 'pending' ? (
                      <div className="flex gap-1">
                        <button className="springos-btn springos-btn-glow text-[11px] py-0.5 px-2" onClick={() => setSelectedSuggestion(s)}>
                          РАССМОТРЕТЬ
                        </button>
                      </div>
                    ) : (
                      <span className={s.status === 'approved' ? 'springos-badge-alive' : 'springos-badge-springlocked'} style={{ fontSize: 11 }}>
                        {s.status === 'approved' ? 'ПРИНЯТО' : 'ОТКЛОНЕНО'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedSuggestion && originalManga && (
        <div className="springos-modal-overlay" onClick={() => setSelectedSuggestion(null)}>
          <div
            className="springos-metal-frame springos-modal p-6"
            style={{ maxWidth: 600, width: '92%' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>
              ПРАВКА ДЛЯ "{selectedSuggestion.mangaTitle}"
            </div>
            <DiffViewer original={originalManga} suggestion={selectedSuggestion.data} />
            <div className="springos-divider" />
            <div className="flex gap-3">
              <button className="springos-btn springos-btn-glow text-[14px] springos-glitch-hover" onClick={handleApprove}>
                ПРИНЯТЬ
              </button>
              <button className="springos-btn springos-btn-danger text-[14px]" onClick={handleReject}>
                ОТКЛОНИТЬ
              </button>
              <button className="springos-btn text-[14px]" onClick={() => setSelectedSuggestion(null)}>
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuggestionsPage;
