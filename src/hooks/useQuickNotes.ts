import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEY = 'openmoon_quick_notes';
const MIGRATION_FLAG = 'openmoon_quick_notes_migrated';

export const useQuickNotes = () => {
  const [quickNotes, setQuickNotes] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        if (!localStorage.getItem(MIGRATION_FLAG)) {
          const savedNotes = localStorage.getItem(STORAGE_KEY);
          if (savedNotes) {
            const legacy = JSON.parse(savedNotes);
            if (Array.isArray(legacy) && legacy.length > 0) {
              await invoke('migrate_quick_notes', { notes: legacy });
            }
          }
          localStorage.setItem(MIGRATION_FLAG, 'true');
        }
        const notes = await invoke<string[]>('get_notes');
        setQuickNotes(notes);
      } catch (e) {
      }
    };
    load();
  }, []);

  const addNote = (note: string) => {
    const newNotes = [...quickNotes, note];
    setQuickNotes(newNotes);
    invoke('add_note', { note }).catch(() => {});
    return newNotes;
  };

  const clearNotes = () => {
    setQuickNotes([]);
    invoke('clear_notes').catch(() => {});
  };

  return { quickNotes, addNote, clearNotes };
};
