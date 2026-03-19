import React, { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  confirmText?: string;
  placement?: 'center' | 'right';
  offsetRightPx?: number;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, onConfirm, confirmText = 'Подтвердить', placement = 'center', offsetRightPx = 84 }) => {
  const overlayClasses = placement === 'right'
    ? 'fixed inset-0 bg-black/50 z-[11000] flex items-center justify-center md:justify-end p-4'
    : 'fixed inset-0 bg-black/50 z-[11000] flex items-center justify-center p-4';

  const panelMotion = placement === 'right'
    ? { initial: { x: 80, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 80, opacity: 0 } }
    : { initial: { y: -50, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 50, opacity: 0 } };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className={overlayClasses}
        >
          <motion.div
            {...panelMotion}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface shadow-2xl shadow-rust-20 w-full max-w-[calc(100vw-2rem)] sm:max-w-md border border-overlay max-h-[90vh] overflow-y-auto"
            style={placement === 'right' && typeof window !== 'undefined' && window.innerWidth >= 768 ? { marginRight: offsetRightPx } : undefined}
          >
            <div className="p-6 border-b border-overlay">
              <h2 className="text-xl font-bold text-text-primary">{title}</h2>
            </div>
            <div className="p-6 text-sm">
              {children}
            </div>
            <div className="p-4 bg-base-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-mono font-semibold bg-overlay text-text-primary hover:bg-surface-hover transition-colors border border-overlay"
              >
                Отмена
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 text-sm font-mono font-semibold bg-brand-accent text-black hover:shadow-[0_0_12px_rgba(169,255,0,0.3)] transition-all"
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
;

export default Modal;