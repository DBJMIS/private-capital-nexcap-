'use client';

import { MessageCircle, X } from 'lucide-react';

import { useAssistant } from '@/contexts/AssistantContext';

export function AssistantButton() {
  const { isOpen, toggleOpen, hasUnread } = useAssistant();

  return (
    <button
      type="button"
      aria-label={isOpen ? 'Close NexCap Assistant' : 'Open NexCap Assistant'}
      aria-expanded={isOpen}
      onClick={toggleOpen}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#00A99D] shadow-lg transition-colors duration-200 hover:bg-[#009488] focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2"
    >
      {isOpen ? <X size={22} color="white" /> : <MessageCircle size={22} color="white" />}

      {hasUnread && !isOpen ? (
        <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-400" />
      ) : null}
    </button>
  );
}
