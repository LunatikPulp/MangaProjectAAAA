import React, { useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';

type DataType = 'frame' | 'cover' | 'background' | 'stickers' | 'skin';

interface ExtractedFile {
  name: string;
  url: string;
  isImage: boolean;
  isVideo: boolean;
  isCss: boolean;
  broken: boolean;
}

const ShopDataInjector: React.FC<{
  onSubmit: (data: { type: DataType; file: File | null; preview: string; extractedFiles: ExtractedFile[]; name: string; price: number; description: string }) => void;
  onCancel: () => void;
}> = ({ onSubmit, onCancel }) => {
  const [dataType, setDataType] = useState<DataType>('frame');
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [name, setName] = useState('');
  const [price, setPrice] = useState(100);
  const [description, setDescription] = useState('');
  const [cssVars, setCssVars] = useState('');

  const dropRef = useRef<HTMLDivElement>(null);

  const processFile = useCallback(async (file: File) => {
    setUploadedFile(file);

    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setExtractedFiles([]);
      return;
    }

    if (file.name.endsWith('.zip')) {
      setExtracting(true);
      setExtractProgress(0);
      setExtractedFiles([]);

      try {
        const zip = await JSZip.loadAsync(file);
        const fileNames: string[] = [];
        zip.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir) fileNames.push(relativePath);
        });

        const total = fileNames.length;
        let processed = 0;
        const extracted: ExtractedFile[] = [];
        let firstImageUrl = '';

        for (const fPath of fileNames) {
          const blob = await zip.file(fPath)!.async('blob');
          const isImage = /\.(jpe?g|png|gif|webp|bmp)$/i.test(fPath);
          const isVideo = /\.(mp4|webm)$/i.test(fPath);
          const isCss = /\.css$/i.test(fPath);

          if (isImage || isVideo) {
            const url = URL.createObjectURL(blob);
            extracted.push({ name: fPath.split('/').pop() || fPath, url, isImage, isVideo, isCss: false, broken: false });
            if (!firstImageUrl && isImage) firstImageUrl = url;
          } else if (isCss) {
            const text = await blob.text();
            setCssVars(text);
            extracted.push({ name: fPath.split('/').pop() || fPath, url: '', isImage: false, isVideo: false, isCss: true, broken: false });
          }

          processed++;
          setExtractProgress(Math.round((processed / total) * 100));
        }

        setExtractedFiles(extracted);
        if (firstImageUrl) setPreviewUrl(firstImageUrl);
      } catch (e) {
        console.error('ZIP extraction failed:', e);
      } finally {
        setExtracting(false);
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }, []);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) processFile(file); }, [processFile]);

  const handleSubmit = () => {
    onSubmit({ type: dataType, file: uploadedFile, preview: previewUrl, extractedFiles, name, price, description });
  };

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
      extractedFiles.forEach(f => { if (f.url.startsWith('blob:')) URL.revokeObjectURL(f.url); });
    };
  }, []);

  const typeOptions: { value: DataType; label: string; accept: string }[] = [
    { value: 'frame', label: 'РАМКА / АВАТАР', accept: '.png,.gif,.mp4,.webp' },
    { value: 'cover', label: 'ОБЛОЖКА', accept: '.png,.jpg,.jpeg,.webp' },
    { value: 'background', label: 'ФОН ПРОФИЛЯ', accept: '.png,.jpg,.jpeg,.mp4' },
    { value: 'stickers', label: 'СТИКЕРЫ (ZIP)', accept: '.zip' },
    { value: 'skin', label: 'СКИН (ZIP/CSS)', accept: '.zip,.css' },
  ];

  const currentAccept = typeOptions.find(o => o.value === dataType)?.accept || '*';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT: Upload Zone */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="font-terminal text-[18px]" style={{ color: '#9b8c3b' }}>
            ПРИЁМНИК КАРТРИДЖЕЙ
          </span>
          <span className="font-code text-[9px]" style={{ color: '#7a7060' }}>
            МОДУЛЬ_ЗАГРУЗКИ
          </span>
        </div>

        {/* Type Toggle */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {typeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDataType(opt.value)}
              className={`springos-btn text-[12px] py-1 px-2.5 springos-glitch-hover ${
                dataType === opt.value ? 'springos-btn-glow' : ''
              }`}
            >
              {dataType === opt.value ? '▸ ' : '  '}{opt.label}
            </button>
          ))}
        </div>

        {/* Drop Zone */}
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative border-2 border-dashed rounded p-8 text-center transition-all duration-200 ${
            dragOver ? 'springos-drag-active' : ''
          }`}
          style={{
            borderColor: dragOver ? '#39ff14' : '#9b8c3b',
            background: dragOver ? 'rgba(57, 255, 20, 0.03)' : 'rgba(14, 13, 12, 0.6)',
          }}
        >
          {/* Noise overlay inside drop zone */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.02] rounded"
            style={{
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='128' height='128' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
              backgroundSize: '64px',
            }}
          />

          <div className="relative z-10">
            <div
              className="font-terminal text-[20px] mb-2 springos-glow-mustard springos-drop-text"
              style={{ color: '#9b8c3b' }}
            >
              {'>'} ПОМЕСТИТЕ_АРХИВ_СЮДА
            </div>
            <div className="font-code text-[10px] mb-4" style={{ color: '#8a8070' }}>
              ПЕРЕТАЩИТЕ ФАЙЛ ИЛИ НАЖМИТЕ ДЛЯ ВЫБОРА
            </div>
            <input
              type="file"
              accept={currentAccept}
              onChange={handleFileInput}
              className="hidden"
              id="springos-file-upload"
            />
            <label
              htmlFor="springos-file-upload"
              className="springos-btn springos-btn-primary text-[13px] cursor-pointer inline-block springos-glitch-hover"
            >
              ВЫБРАТЬ_ФАЙЛ
            </label>

            {uploadedFile && (
              <div className="mt-3 font-code text-[11px]" style={{ color: '#5a6638' }}>
                ФАЙЛ:: {uploadedFile.name}
                <span style={{ color: '#7a7060' }}> ({(uploadedFile.size / 1024).toFixed(1)} КБ)</span>
              </div>
            )}

            {extracting && (
              <div className="mt-4">
                <div className="font-code text-[12px] springos-glow-green mb-1">
                  {'>'} РАСПАКОВКА АРХИВА... {extractProgress}%
                </div>
                <div className="springos-progress" style={{ width: '80%', margin: '0 auto' }}>
                  <div className="springos-progress-bar" style={{ width: `${extractProgress}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="mt-4 space-y-3">
          <div>
            <label className="font-terminal text-[13px] tracking-[2px] block mb-1" style={{ color: '#9a9080' }}>
              НАЗВАНИЕ_ОБЪЕКТА
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="springos-input w-full py-2 px-3"
              placeholder="> ВВЕДИТЕ_НАЗВАНИЕ"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-terminal text-[13px] tracking-[2px] block mb-1" style={{ color: '#9a9080' }}>
                ЦЕНА_SCRAP
              </label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                className="springos-input w-full py-2 px-3"
                placeholder="100"
              />
            </div>
            <div>
              <label className="font-terminal text-[13px] tracking-[2px] block mb-1" style={{ color: '#9a9080' }}>
                ТИП ДАННЫХ
              </label>
              <div className="font-code text-[13px] py-2 px-3" style={{ color: '#5a6638', background: '#0e0d0c', border: '1px solid #2a2420' }}>
                {typeOptions.find(o => o.value === dataType)?.label}
              </div>
            </div>
          </div>
          <div>
            <label className="font-terminal text-[13px] tracking-[2px] block mb-1" style={{ color: '#9a9080' }}>
              ОПИСАНИЕ
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="springos-input w-full py-2 px-3 resize-none"
              style={{ height: 70 }}
              placeholder="> ОПИСАНИЕ_ТОВАРА..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={!uploadedFile || !name}
            className="springos-btn springos-btn-glow text-[15px] springos-glitch-hover disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Запустить_Загрузку()
          </button>
          <button onClick={onCancel} className="springos-btn springos-btn-danger text-[15px]">
            ОТМЕНА
          </button>
        </div>
      </div>

      {/* RIGHT: Preview Terminal */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="font-terminal text-[18px]" style={{ color: '#5a6638' }}>
            ТЕРМИНАЛ СИМУЛЯЦИИ
          </span>
          <span className="font-code text-[9px]" style={{ color: '#7a7060' }}>
            ПРЕДПРОСМОТР
          </span>
        </div>

        <div
          className="springos-metal-frame springos-rust-dots rounded overflow-hidden"
          style={{ minHeight: 420 }}
        >
          <div className="relative z-10">
            {/* Preview header bar */}
            <div
              className="flex items-center justify-between px-3 py-1.5"
              style={{ borderBottom: '1px solid #2a2420', background: 'rgba(0, 0, 0, 0.2)' }}
            >
              <span className="font-code text-[9px]" style={{ color: '#7a7060' }}>
                СИМУЛЯЦИЯ::{dataType.toUpperCase()}
              </span>
              <span className="springos-rec" style={{ fontSize: '9px' }}>REC</span>
            </div>

            <div className="p-4">
              {/* Frame / Background / Cover Preview */}
              {(dataType === 'frame' || dataType === 'background' || dataType === 'cover') && !extractedFiles.length && (
                <FakeProfilePreview dataType={dataType} previewUrl={previewUrl} />
              )}

              {/* Stickers Grid */}
              {dataType === 'stickers' && extractedFiles.length > 0 && (
                <div>
                  <div className="font-code text-[12px] springos-glow-green mb-3">
                    {'>'} РАСПАКОВКА АРХИВА... 100%
                    <span className="ml-2" style={{ color: '#5a6638' }}>
                      [НАЙДЕНО {extractedFiles.filter(f => f.isImage).length} ОБЪЕКТОВ]
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {extractedFiles.filter(f => f.isImage).map((f, i) => (
                      <div
                        key={i}
                        className="springos-metal-frame rounded p-1.5 flex items-center justify-center"
                        style={{ minHeight: 64, aspectRatio: '1' }}
                      >
                        <div className="relative z-10 flex items-center justify-center w-full h-full">
                          <img
                            src={f.url}
                            alt={f.name}
                            className="max-w-full max-h-14 object-contain"
                            style={{ filter: f.broken ? 'hue-rotate(90deg) saturate(3)' : 'none' }}
                            onError={e => {
                              const el = e.target as HTMLImageElement;
                              el.style.filter = 'hue-rotate(90deg) saturate(3)';
                              f.broken = true;
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {extractedFiles.filter(f => f.broken).length > 0 && (
                    <div className="mt-3 font-code text-[11px] springos-glow-blood">
                      ⚠ ОБНАРУЖЕНО БИТЫХ: {extractedFiles.filter(f => f.broken).length}
                    </div>
                  )}
                </div>
              )}

              {/* Skin/CSS Preview */}
              {dataType === 'skin' && cssVars && (
                <div>
                  <div className="font-code text-[12px] springos-glow-green mb-2">
                    {'>'} ПРИМЕНЕНИЕ СКИНА... OK
                  </div>
                  <div className="springos-metal-frame rounded p-3" style={{ minHeight: 120 }}>
                    <div className="relative z-10">
                      <div className="font-code text-[9px] mb-1" style={{ color: '#8a8070' }}>
                        CSS-ПЕРЕМЕННЫЕ:
                      </div>
                      <pre className="font-code text-[10px] overflow-auto max-h-32 springos-scroll" style={{ color: '#5a6638' }}>
                        {cssVars.substring(0, 500)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!uploadedFile && (
                <div className="text-center py-16">
                  <div className="font-terminal text-[18px]" style={{ color: '#2a2420' }}>
                    НЕТ ДАННЫХ
                  </div>
                  <div className="font-code text-[9px] mt-2" style={{ color: '#1e1a16' }}>
                    ЗАГРУЗИТЕ ФАЙЛ В ПРИЁМНИК КАРТРИДЖЕЙ
                  </div>
                  {/* ASCII art */}
                  <pre className="font-code text-[8px] mt-6 inline-block" style={{ color: '#1e1a16' }}>
{`   ┌─────────────┐
   │  ░░░░░░░░░  │
   │  ░ NO SIG ░  │
   │  ░░░░░░░░░  │
   └─────────────┘`}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* Fake Profile for Frame/Background Preview */
const FakeProfilePreview: React.FC<{ dataType: DataType; previewUrl: string }> = ({ dataType, previewUrl }) => (
  <div className="rounded overflow-hidden" style={{ background: '#0a0908' }}>
    {/* Cover preview */}
    {dataType === 'cover' && previewUrl && (
      <div className="p-4">
        <div className="flex gap-3">
          <div className="flex-shrink-0 rounded overflow-hidden" style={{ width: 100, height: 140, border: '1px solid #2a2420' }}>
            <img src={previewUrl} alt="cover" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-terminal text-[15px] mb-1" style={{ color: '#d4c8b0' }}>Пример Манги</div>
            <div className="font-code text-[9px]" style={{ color: '#9a9080' }}>
              ТИП::MANHWA | СТАТУС::В ПРОЦЕССЕ
            </div>
            <div className="font-code text-[9px] mt-1" style={{ color: '#7a7060' }}>
              РЕЙТИНГ::8.5 | ГЛАВЫ::124
            </div>
            <div className="mt-2">
              <span className="springos-badge-alive" style={{ fontSize: 11 }}>ПРОСМОТР ОБЛОЖКИ</span>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Cover empty state */}
    {dataType === 'cover' && !previewUrl && (
      <div className="p-4">
        <div className="flex gap-3">
          <div
            className="flex-shrink-0 rounded flex items-center justify-center font-code text-[9px]"
            style={{ width: 100, height: 140, background: '#161210', border: '1px dashed #2a2420', color: '#2a2420' }}
          >
            ОБЛОЖКА
          </div>
          <div className="flex-1">
            <div className="font-terminal text-[15px] mb-1" style={{ color: '#7a7060' }}>Пример Манги</div>
            <div className="font-code text-[9px]" style={{ color: '#1e1a16' }}>ЗАГРУЗИТЕ ОБЛОЖКУ</div>
          </div>
        </div>
      </div>
    )}

    {/* Background preview */}
    {dataType === 'background' && previewUrl && (
      previewUrl.match(/\.(mp4|webm)$/i) || (previewUrl.startsWith('blob:') && false) ? (
        <div className="relative h-32 overflow-hidden">
          <video src={previewUrl} className="w-full h-full object-cover" autoPlay muted loop />
          <div className="absolute inset-0" style={{ background: 'rgba(17,16,15,0.4)' }} />
          <div className="absolute inset-0 z-10 p-3">
            <div className="font-terminal text-[16px]" style={{ color: '#d4c8b0' }}>Охранник_87</div>
            <div className="font-code text-[9px]" style={{ color: '#9a9080' }}>
              УРОВЕНЬ::12 | XP::3400 | СКРАП::1500
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative h-32 bg-cover bg-center"
          style={{ backgroundImage: `url(${previewUrl})` }}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(17,16,15,0.4)' }} />
          <div className="relative z-10 p-3">
            <div className="font-terminal text-[16px]" style={{ color: '#d4c8b0' }}>Охранник_87</div>
            <div className="font-code text-[9px]" style={{ color: '#9a9080' }}>
              УРОВЕНЬ::12 | XP::3400 | СКРАП::1500
            </div>
          </div>
        </div>
      )
    )}

    {/* Profile card */}
    <div className="flex items-center gap-3 p-4">
      <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
        <div
          className="w-full h-full rounded-full overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #3a3028, #241e1a)',
            border: dataType === 'frame' && previewUrl ? 'none' : '2px solid #3a3028',
            boxShadow: dataType === 'frame' && previewUrl ? '0 0 12px rgba(155, 140, 59, 0.3)' : 'none',
          }}
        >
          {dataType === 'frame' && previewUrl && (
            <img
              src={previewUrl}
              alt="frame"
              className="w-full h-full rounded-full object-cover"
              style={{ opacity: 0.8, mixBlendMode: 'screen' }}
            />
          )}
          <div
            className="absolute inset-0 flex items-center justify-center font-terminal text-[18px]"
            style={{ color: '#6a6050' }}
          >
            О87
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-terminal text-[16px]" style={{ color: '#d4c8b0' }}>
          Охранник_87
        </div>
        <div className="font-code text-[9px]" style={{ color: '#7a7060' }}>
          СТАТУС::АКТИВЕН | ПОСЛЕДНИЙ_ВХОД::12.04.2026
        </div>
        <div className="flex gap-2 mt-1.5">
          <span className="springos-badge-alive" style={{ fontSize: 12 }}>ЖИВ</span>
          <span className="font-code text-[9px]" style={{ color: '#9a9080' }}>
            47 глав | 1500 скрап
          </span>
        </div>
      </div>
    </div>

    {!previewUrl && (
      <div className="text-center py-4" style={{ borderTop: '1px solid #1e1a16' }}>
        <div className="font-code text-[9px]" style={{ color: '#2a2420' }}>
          ЗАГРУЗИТЕ ФАЙЛ ДЛЯ ПРЕДПРОСМОТРА
        </div>
      </div>
    )}
  </div>
);

export default ShopDataInjector;
