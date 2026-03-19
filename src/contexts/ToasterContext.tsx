import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ToasterContextType {
  showToaster: (message: string) => void;
}

export const ToasterContext = createContext<ToasterContextType>({
  showToaster: () => {},
});

let toasterId = 0;

export const ToasterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);

  const showToaster = useCallback((message: string) => {
    const id = toasterId++;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  return (
    <ToasterContext.Provider value={{ showToaster }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 50, scale: 0.3 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.5 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="bg-overlay border border-surface text-text-primary text-sm font-medium px-4 py-2 rounded-lg shadow-lg"
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToasterContext.Provider>
  );
};
