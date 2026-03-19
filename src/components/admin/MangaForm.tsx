import React, { useState, useRef } from 'react';
import { Manga, MangaFormData } from '../../types';
import Modal from '../Modal';
import { motion } from 'framer-motion';

interface MangaFormProps {
  onSubmit: (formData: MangaFormData) => void;
  initialData?: Manga;
  onCancel?: () => void;
  submitText?: string;
}

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-surface-50 backdrop-blur-sm rounded-none p-8 border border-white/5 shadow-sm">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span className="w-1 h-6 bg-brand rounded-none"></span>
            {title}
        </h2>
        <div className="space-y-6">{children}</div>
    </div>
);

const FormField: React.FC<{ label: string; children: React.ReactNode; required?: boolean }> = ({ label, children, required }) => (
    <div className="group">
        <label className="text-sm font-semibold text-muted group-focus-within:text-brand transition-colors mb-2 block">
            {label} {required && <span className="text-brand-accent">*</span>}
        </label>
        {children}
    </div>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input 
        {...props} 
        className="w-full bg-base-50 border border-white/10 rounded-lg p-3 text-text-primary focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-muted-50" 
    />
);

const TextArea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea 
        {...props} 
        className="w-full bg-base-50 border border-white/10 rounded-lg p-3 text-text-primary focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-muted-50 resize-y min-h-[120px]" 
    />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <div className="relative">
        <select 
            {...props} 
            className="w-full bg-base-50 border border-white/10 rounded-lg p-3 text-text-primary focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all appearance-none cursor-pointer" 
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    </div>
);

const MangaForm: React.FC<MangaFormProps> = ({ onSubmit, initialData, onCancel, submitText }) => {
  const [formData, setFormData] = useState<MangaFormData>({
    title: initialData?.title || '',
    cover: initialData?.cover || '',
    description: initialData?.description || '',
    year: initialData?.year || new Date().getFullYear(),
    genres: initialData?.genres || [],
    type: initialData?.type || 'Manhwa',
    status: initialData?.status || 'В процессе',
  });
  const [newGenre, setNewGenre] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: MangaFormData) => ({ ...prev, [name]: name === 'year' ? parseInt(value) : value }));
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setFormData((prev: MangaFormData) => ({ ...prev, cover: reader.result as string }));
          };
          reader.readAsDataURL(file);
      }
  };

  const handleAddGenre = () => {
    if (newGenre && !formData.genres.includes(newGenre)) {
      setFormData((prev: MangaFormData) => ({ ...prev, genres: [...prev.genres, newGenre] }));
      setNewGenre('');
    }
  };

  const handleRemoveGenre = (genreToRemove: string) => {
    setFormData((prev: MangaFormData) => ({ ...prev, genres: prev.genres.filter((g: string) => g !== genreToRemove) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };
  
  const handleCoverDelete = () => {
    setFormData((prev: MangaFormData) => ({ ...prev, cover: '' }));
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
    setModalOpen(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-5xl mx-auto">
      <FormSection title="Основная информация">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-4">
                <FormField label="Обложка">
                   <div className="w-full aspect-[2/3] bg-base-50 rounded-none flex items-center justify-center relative overflow-hidden border-2 border-dashed border-white/10 hover:border-brand-50 transition-colors group">
                       {formData.cover ? (
                           <>
                                <img src={formData.cover} alt="Предпросмотр" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button 
                                        type="button" 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-none backdrop-blur-sm transition-colors"
                                        title="Изменить"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setModalOpen(true)} 
                                        className="bg-brand-accent/80 hover:bg-brand-accent text-white p-2 rounded-none backdrop-blur-sm transition-colors"
                                        title="Удалить"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                           </>
                       ) : (
                           <div className="text-center text-muted p-4 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                               <div className="w-16 h-16 bg-white/5 rounded-none flex items-center justify-center mx-auto mb-3 text-brand">
                                   <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                               </div>
                               <p className="text-sm font-medium text-text-primary">Нажмите для загрузки</p>
                               <p className="text-xs mt-1">или вставьте URL ниже</p>
                           </div>
                       )}
                   </div>
                   <input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
                </FormField>
                
                <div className="mt-4">
                     <FormField label="URL Обложки">
                        <div className="relative">
                            <Input 
                                type="url" 
                                name="cover" 
                                value={formData.cover.startsWith('data:') ? '' : formData.cover} 
                                onChange={handleChange} 
                                placeholder="https://example.com/image.jpg" 
                                className="pl-9 w-full bg-base-50 border border-white/10 rounded-lg p-3 text-text-primary focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-muted-50"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            </div>
                        </div>
                    </FormField>
                </div>
            </div>
            
            <div className="md:col-span-8 space-y-6">
                 <FormField label="Название" required>
                    <Input type="text" name="title" value={formData.title} onChange={handleChange} required placeholder="Например: Поднятие уровня в одиночку" />
                </FormField>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FormField label="Тип">
                        <Select name="type" value={formData.type} onChange={handleChange}>
                            <option value="Manhwa">Манхва</option>
                            <option value="Manga">Манга</option>
                            <option value="Manhua">Маньхуа</option>
                        </Select>
                    </FormField>
                    
                    <FormField label="Статус">
                        <Select name="status" value={formData.status} onChange={handleChange}>
                            <option>В процессе</option>
                            <option>Завершено</option>
                        </Select>
                    </FormField>
                    
                    <FormField label="Год выпуска" required>
                        <Input type="number" name="year" value={formData.year} onChange={handleChange} required />
                    </FormField>
                </div>

                <FormField label="Описание" required>
                    <TextArea name="description" value={formData.description} onChange={handleChange} required placeholder="Краткое описание сюжета..." />
                </FormField>
            </div>
        </div>
      </FormSection>

      <FormSection title="Жанры">
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-base-30 rounded-lg border border-white/5">
            {formData.genres.length > 0 ? formData.genres.map((genre: string) => (
                <motion.span 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    key={genre} 
                    className="inline-flex items-center gap-1.5 bg-brand-10 text-brand px-3 py-1 rounded-none text-sm border border-brand-20 pl-4"
                >
                {genre}
                <button 
                    type="button" 
                    onClick={() => handleRemoveGenre(genre)} 
                    className="w-5 h-5 rounded-none hover:bg-brand-20 flex items-center justify-center transition-colors ml-1"
                >
                    &times;
                </button>
                </motion.span>
            )) : (
                <span className="text-muted text-sm self-center px-2">Жанры не выбраны</span>
            )}
            </div>
            
            <div className="flex gap-2">
            <div className="relative flex-grow">
                <Input
                    type="text"
                    value={newGenre}
                    onChange={(e) => setNewGenre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddGenre())}
                    placeholder="Введите название жанра и нажмите Enter"
                />
            </div>
            <button 
                type="button" 
                onClick={handleAddGenre} 
                className="bg-brand hover:bg-brand-hover text-white font-bold px-6 rounded-lg transition-all active:scale-95 shadow-lg shadow-brand-20"
            >
                Добавить
            </button>
            </div>
            
            {/* Suggestions (optional, hardcoded for now) */}
            <div className="flex flex-wrap gap-2 text-xs text-muted">
                <span>Популярные:</span>
                {['Экшен', 'Приключения', 'Фэнтези', 'Драма', 'Романтика', 'Комедия'].map(g => (
                    <button 
                        key={g} 
                        type="button" 
                        onClick={() => {
                            if (!formData.genres.includes(g)) {
                                setFormData((prev: MangaFormData) => ({ ...prev, genres: [...prev.genres, g] }));
                            }
                        }}
                        className="hover:text-brand underline decoration-dotted underline-offset-2 transition-colors"
                    >
                        {g}
                    </button>
                ))}
            </div>
        </div>
      </FormSection>

      <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
        {onCancel && (
            <button 
                type="button" 
                onClick={onCancel} 
                className="px-6 py-2.5 rounded-lg font-medium text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            >
                Отмена
            </button>
        )}
        <button 
            type="submit" 
            className="bg-brand hover:bg-brand-hover text-white font-bold py-2.5 px-8 rounded-lg transition-all shadow-lg shadow-brand-20 hover:shadow-brand-40 hover:-translate-y-0.5 active:translate-y-0"
        >
          {submitText || (initialData ? 'Сохранить изменения' : 'Создать мангу')}
        </button>
      </div>

       <Modal
            isOpen={isModalOpen}
            onClose={() => setModalOpen(false)}
            title="Удалить обложку"
            onConfirm={handleCoverDelete}
            confirmText="Удалить"
        >
            <p className="text-text-secondary">Вы уверены, что хотите удалить обложку? Это действие нельзя будет отменить.</p>
        </Modal>
    </form>
  );
};

export default MangaForm;