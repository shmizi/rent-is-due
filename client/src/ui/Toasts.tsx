import { AnimatePresence, motion } from 'motion/react';
import { useRoom } from '../net/useRoom.ts';

export function Toasts() {
  const { toasts } = useRoom();

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className={`max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${toast.tone === 'error' ? 'bg-[#3a1d27] text-danger' : 'bg-raised text-text'}`}
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
