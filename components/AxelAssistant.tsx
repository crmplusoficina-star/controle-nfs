'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function AxelAssistant() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'axel'; text: string }[]>([
    { role: 'axel', text: `Olá, ${user?.name?.split(' ')?.[0] || 'que bom te ver'}! Sou o AXEL, assistente inteligente da Tracbel. O que você precisa hoje?` }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/axel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userText,
          history: messages.slice(-5), // Send last 5 messages for context
          userContext: user
        })
      });

      if (!res.ok) throw new Error('Falha de conexão com AXEL');

      const data = await res.json();
      
      if (data.action === 'navigate') {
        const p = data.path || '/dashboard';
        setMessages(prev => [...prev, { role: 'axel', text: `Entendido! Abrindo ${p}...` }]);
        router.push(p);
        setTimeout(() => setIsOpen(false), 1500);
      } else {
        setMessages(prev => [...prev, { role: 'axel', text: data.message || 'Desculpe, não entendi. Pode reformular?' }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'axel', text: 'Ops, tive um problema ao processar isso. Tente novamente.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative z-[9999]">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 px-4 bg-indigo-950 text-white rounded-full shadow-lg border border-indigo-700/50 group"
      >
        <Sparkles size={16} className="text-amber-500" />
        <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-amber-500 transition-colors">Pergunte pro AXEL</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-12 right-0 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-indigo-950 p-4 flex items-center justify-between text-white border-b border-indigo-900">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-900 border border-indigo-700">
                  <Bot size={18} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-black italic uppercase leading-none">AXEL</h3>
                  <span className="text-[9px] text-amber-500 font-bold uppercase tracking-widest block mt-0.5">Assistente Inteligente</span>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-indigo-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto bg-slate-50 min-h-[250px] max-h-[350px] flex flex-col gap-3 custom-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={`flex max-w-[85%] ${m.role === 'axel' ? 'self-start' : 'self-end'}`}>
                  <div className={`p-3 rounded-2xl text-xs font-medium ${
                    m.role === 'axel' ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm' : 'bg-indigo-600 text-white rounded-tr-sm shadow-sm'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex self-start bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-tl-sm p-3">
                  <Loader2 size={14} className="animate-spin text-amber-500" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Fale com o AXEL..."
                className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-900"
              />
              <button 
                type="submit" 
                disabled={!input.trim() || isLoading}
                className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={14} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
