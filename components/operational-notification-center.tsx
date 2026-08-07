'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Bell, CheckCircle2, ChevronRight, ShieldAlert, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type OperationalNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  action_screen?: string | null;
  entity_id?: string | null;
};

const TRACKED_NOTIFICATION_TYPES = ['toolbox_status', 'caution_activity', 'handover_activity'];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isCritical(notification: OperationalNotification) {
  const text = `${notification.title} ${notification.message}`.toLowerCase();
  return text.includes('danific') || text.includes('não recebeu') || text.includes('nao recebeu') || text.includes('não recebi') || text.includes('nao recebi');
}

function isCautionActivity(notification: OperationalNotification) {
  return notification.type === 'caution_activity';
}

function isHandoverActivity(notification: OperationalNotification) {
  return notification.type === 'handover_activity';
}

function shouldShowBrowserAlert(notification: OperationalNotification) {
  return isCritical(notification) || isCautionActivity(notification) || isHandoverActivity(notification);
}

export function OperationalNotificationCenter() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<OperationalNotification | null>(null);
  const [loading, setLoading] = useState(false);
  const isAdministrator = user?.role === 'Administrador';

  const loadNotifications = useCallback(async () => {
    if (!user?.registration || !isAdministrator) {
      setNotifications([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_notifications')
        .select('id, type, title, message, is_read, created_at, action_screen, entity_id')
        .eq('user_registration', user.registration)
        .in('type', TRACKED_NOTIFICATION_TYPES)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications((data || []) as OperationalNotification[]);
    } catch (error) {
      console.error('Falha ao carregar alertas operacionais:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdministrator, user?.registration]);

  useEffect(() => {
    void loadNotifications();
    if (!user?.registration || !isAdministrator) return;

    const channel = supabase
      .channel(`operational-notifications-${user.registration}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_notifications',
          filter: `user_registration=eq.${user.registration}`,
        },
        (payload) => {
          const row = payload.new as Partial<OperationalNotification>;
          if (
            payload.eventType === 'INSERT'
            && row?.type
            && TRACKED_NOTIFICATION_TYPES.includes(row.type)
            && row.id
          ) {
            const incoming = row as OperationalNotification;
            setToast(incoming);
            window.setTimeout(() => {
              setToast((current) => current?.id === incoming.id ? null : current);
            }, 12_000);

            if (
              typeof Notification !== 'undefined'
              && Notification.permission === 'granted'
              && shouldShowBrowserAlert(incoming)
            ) {
              try {
                new Notification(incoming.title, { body: incoming.message });
              } catch {
                // O aviso interno continua ativo mesmo se o navegador bloquear a notificação nativa.
              }
            }
          }
          void loadNotifications();
        },
      )
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadNotifications();
    };
    const refreshOnFocus = () => void loadNotifications();

    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
      void supabase.removeChannel(channel);
    };
  }, [isAdministrator, loadNotifications, user?.registration]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );
  const criticalCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read && isCritical(notification)).length,
    [notifications],
  );
  const cautionCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read && isCautionActivity(notification)).length,
    [notifications],
  );
  const handoverCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read && isHandoverActivity(notification)).length,
    [notifications],
  );

  const markRead = async (notification: OperationalNotification) => {
    if (!notification.is_read) {
      const { error } = await supabase
        .from('app_notifications')
        .update({ is_read: true })
        .eq('id', notification.id);

      if (!error) {
        setNotifications((rows) => rows.map((row) => row.id === notification.id ? { ...row, is_read: true } : row));
      }
    }
  };

  const openDestination = async (notification?: OperationalNotification) => {
    if (notification) await markRead(notification);
    setOpen(false);
    setToast(null);
    router.push(notification && isHandoverActivity(notification) ? '/dashboard/historico' : '/dashboard/cautelia');
  };

  const archiveAll = async () => {
    if (!user?.registration) return;
    const { error } = await supabase
      .from('app_notifications')
      .update({ is_read: true, dismissed_at: new Date().toISOString() })
      .eq('user_registration', user.registration)
      .in('type', TRACKED_NOTIFICATION_TYPES)
      .is('dismissed_at', null);

    if (!error) {
      setNotifications([]);
      setOpen(false);
    }
  };

  const enableBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      await Notification.requestPermission();
    } catch {
      // Alguns navegadores controlam a permissão nas configurações do site.
    }
  };

  if (!isAdministrator) {
    return (
      <button className="p-2 text-slate-400 rounded-full relative" type="button" aria-label="Notificações">
        <Bell size={20} />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`relative rounded-full p-2 transition-colors ${criticalCount ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : unreadCount ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'text-slate-400 hover:bg-slate-100'}`}
        aria-label={`Alertas operacionais${unreadCount ? `: ${unreadCount} não lidos` : ''}`}
        title="Alertas operacionais"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-black leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar alertas"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[80] cursor-default bg-slate-950/10"
          />
          <section className="absolute right-0 top-12 z-[90] w-[min(92vw,430px)] overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 bg-slate-950 px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <ShieldAlert size={20} className={criticalCount ? 'text-rose-400' : 'text-amber-400'} />
                <div>
                  <strong className="block text-sm">Alertas operacionais</strong>
                  <span className="text-[10px] text-slate-300">
                    {criticalCount
                      ? `${criticalCount} ocorrência${criticalCount === 1 ? '' : 's'} crítica${criticalCount === 1 ? '' : 's'} pendente${criticalCount === 1 ? '' : 's'}`
                      : handoverCount
                        ? `${handoverCount} repasse${handoverCount === 1 ? '' : 's'} entre colaboradores`
                        : cautionCount
                          ? `${cautionCount} nova${cautionCount === 1 ? '' : 's'} cautela${cautionCount === 1 ? '' : 's'}/empréstimo${cautionCount === 1 ? '' : 's'}`
                          : 'Cautelas, empréstimos, repasses e status assinados'}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/15">
                <X size={17} />
              </button>
            </header>

            <div className="max-h-[62vh] overflow-y-auto p-3">
              {loading && !notifications.length ? (
                <p className="p-8 text-center text-xs font-bold text-slate-400">Carregando alertas...</p>
              ) : !notifications.length ? (
                <div className="grid place-items-center gap-2 px-6 py-12 text-center">
                  <CheckCircle2 size={30} className="text-emerald-500" />
                  <strong className="text-sm text-slate-700">Tudo conferido</strong>
                  <span className="text-[11px] text-slate-400">Nenhuma cautela, repasse ou alteração da caixa aguarda sua atenção.</span>
                </div>
              ) : (
                notifications.map((notification) => {
                  const critical = isCritical(notification);
                  const cautionActivity = isCautionActivity(notification);
                  const handoverActivity = isHandoverActivity(notification);
                  return (
                    <button
                      type="button"
                      key={notification.id}
                      onClick={() => void openDestination(notification)}
                      className={`mb-2 flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                        critical && !notification.is_read
                          ? 'border-rose-200 bg-rose-50'
                          : !notification.is_read
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-slate-100 bg-white'
                      }`}
                    >
                      <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${critical ? 'bg-rose-100 text-rose-600' : handoverActivity ? 'bg-indigo-100 text-indigo-700' : cautionActivity ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-600'}`}>
                        {critical ? <AlertTriangle size={17} /> : handoverActivity ? <ArrowRightLeft size={17} /> : cautionActivity ? <ShieldAlert size={17} /> : <CheckCircle2 size={17} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <strong className="text-xs text-slate-900">{notification.title}</strong>
                          {!notification.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{notification.message}</p>
                        <span className="mt-2 block text-[9px] font-bold uppercase tracking-wider text-slate-400">{formatDate(notification.created_at)}</span>
                      </div>
                      <ChevronRight size={16} className="mt-2 shrink-0 text-slate-300" />
                    </button>
                  );
                })
              )}
            </div>

            <footer className="space-y-2 border-t border-slate-100 bg-slate-50 p-3">
              {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
                <button type="button" onClick={() => void enableBrowserAlerts()} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100">
                  Ativar alerta do navegador
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void openDestination()} className="rounded-xl bg-slate-900 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white">
                  Abrir cautelas
                </button>
                <button type="button" disabled={!notifications.length} onClick={() => void archiveAll()} className="rounded-xl bg-white px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 disabled:opacity-40">
                  Arquivar alertas
                </button>
              </div>
            </footer>
          </section>
        </>
      )}

      {toast && (
        <button
          type="button"
          onClick={() => void openDestination(toast)}
          className={`fixed right-4 top-20 z-[110] w-[min(92vw,410px)] rounded-2xl border p-4 text-left shadow-2xl ${isCritical(toast) ? 'border-rose-200 bg-rose-50' : isHandoverActivity(toast) ? 'border-indigo-200 bg-indigo-50' : 'border-amber-200 bg-amber-50'}`}
        >
          <div className="flex items-start gap-3">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isCritical(toast) ? 'bg-rose-500 text-white' : isHandoverActivity(toast) ? 'bg-indigo-600 text-white' : 'bg-amber-400 text-slate-950'}`}>
              {isCritical(toast) ? <AlertTriangle size={19} /> : isHandoverActivity(toast) ? <ArrowRightLeft size={19} /> : <Bell size={19} />}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Novo alerta da Ferramentaria</span>
              <strong className="mt-1 block text-sm text-slate-900">{toast.title}</strong>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{toast.message}</p>
              <span className="mt-2 block text-[9px] font-black uppercase text-slate-500">{isHandoverActivity(toast) ? 'Clique para abrir o Histórico' : 'Clique para abrir Cautelas e Empréstimos'}</span>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
