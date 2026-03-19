import React, { useState } from "react";
import { Manga, Chapter } from "../types";

interface EditMangaPageProps {
  manga: Manga;
  onSave: (updatedManga: Manga) => void;
}

const EditMangaPage: React.FC<EditMangaPageProps> = ({ manga, onSave }) => {
  const [editedManga, setEditedManga] = useState<Manga>(manga);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedManga({ ...editedManga, title: e.target.value });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedManga({ ...editedManga, description: e.target.value });
  };

  const handleChapterTitleChange = (id: string, newTitle: string) => {
    setEditedManga({
      ...editedManga,
      chapters: editedManga.chapters.map((c: Chapter) =>
        c.id === id ? { ...c, title: newTitle } : c
      ),
    });
  };

  const handleSave = () => {
    onSave(editedManga);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Редактировать мангу</h1>

      <div className="mb-4">
        <label className="block mb-2">Название:</label>
        <input
          type="text"
          value={editedManga.title}
          onChange={handleTitleChange}
          className="border p-2 w-full"
        />
      </div>

      <div className="mb-4">
        <label className="block mb-2">Описание:</label>
        <textarea
          value={editedManga.description}
          onChange={handleDescriptionChange}
          className="border p-2 w-full"
        />
      </div>

      <h2 className="text-lg font-semibold mb-2">Главы</h2>
      <ul>
        {editedManga.chapters.map((c: Chapter) => (
          <li key={c.id} className="mb-2">
            <input
              type="text"
              value={c.title}
              onChange={(e) => handleChapterTitleChange(c.id, e.target.value)}
              className="border p-1 w-full"
            />
          </li>
        ))}
      </ul>

      <button
        onClick={handleSave}
        className="mt-4 px-4 py-2 bg-brand-hover text-white rounded"
      >
        Сохранить
      </button>
    </div>
  );
};

export default EditMangaPage;
