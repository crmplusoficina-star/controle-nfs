from pathlib import Path

MARKER = '// SHARED_AVATAR_REALTIME_V1'
LAYOUT = Path('app/dashboard/layout.tsx')
HISTORY = Path('app/dashboard/historico/page.tsx')
PEOPLE = Path('app/dashboard/pessoas/page.tsx')
EXTERNAL = Path('components/external-signature-fixes.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


layout = LAYOUT.read_text(encoding='utf-8')
if MARKER not in layout:
    old_save = """      const { error } = await supabase
        .from('users_access')
        .update({ avatar_url: storedAvatar })
        .eq('registration', user.registration);
      if (error) throw error;
      updateUser?.({ avatar: storedAvatar });
      setSelectedAvatar(storedAvatar);"""
    new_save = """      const { data, error } = await supabase
        .from('users_access')
        .update({ avatar_url: storedAvatar })
        .eq('registration', user.registration)
        .select('avatar_url')
        .maybeSingle();
      if (error) throw error;
      if (!data?.avatar_url) throw new Error('A atualização do avatar não foi confirmada.');
      const confirmedAvatar = normalizeFerramentariaAvatarValue(data.avatar_url, user.registration);
      updateUser?.({ avatar: confirmedAvatar });
      setSelectedAvatar(confirmedAvatar);"""
    layout = replace_once(layout, old_save, new_save, 'verified avatar save')
    layout = replace_once(
        layout,
        '// FERRAMENTARIA_AVATAR_PICKER_V3\n',
        '// FERRAMENTARIA_AVATAR_PICKER_V3\n' + MARKER + '\n',
        'layout realtime marker',
    )
    LAYOUT.write_text(layout, encoding='utf-8')
    print('Verified avatar persistence applied to dashboard layout.')
else:
    print('Dashboard avatar persistence already verified.')

history = HISTORY.read_text(encoding='utf-8')
if MARKER not in history:
    history_effect = r'''

  useEffect(() => {
    const applyUserUpdate = (record: Record<string, any>) => {
      const registration = String(record?.registration || '').trim();
      if (!registration) return;
      setUsersByRegistration((current) => ({
        ...current,
        [registration]: {
          registration,
          name: record?.name || null,
          avatar_url: record?.avatar_url || null,
        },
      }));
    };
    const refreshVisibleRows = () => {
      void fetchTransactions();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshVisibleRows();
    };

    const channel = supabase
      .channel(`history-avatar-sync-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users_access' },
        (payload) => applyUserUpdate(payload.new as Record<string, any>),
      )
      .subscribe();

    window.addEventListener('focus', refreshVisibleRows);
    window.addEventListener('pageshow', refreshVisibleRows);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshVisibleRows);
      window.removeEventListener('pageshow', refreshVisibleRows);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [fetchTransactions]);'''
    anchor = """  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);"""
    history = replace_once(history, anchor, anchor + history_effect, 'history realtime effect')
    history = replace_once(
        history,
        '// FERRAMENTARIA_AVATAR_SYNC_V1\n',
        '// FERRAMENTARIA_AVATAR_SYNC_V1\n' + MARKER + '\n',
        'history realtime marker',
    )
    HISTORY.write_text(history, encoding='utf-8')
    print('History avatar realtime synchronization applied.')
else:
    print('History avatar realtime synchronization already applied.')

people = PEOPLE.read_text(encoding='utf-8')
if MARKER not in people:
    people_effect = r'''

  useEffect(() => {
    const applyUserUpdate = (record: Record<string, any>) => {
      const registration = String(record?.registration || '').trim();
      if (!registration) return;
      setColaboradores((current) => current.map((person) =>
        person.registration === registration
          ? { ...person, ...record, registration }
          : person,
      ));
    };
    const refreshAll = () => {
      void fetchAll();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };

    const channel = supabase
      .channel(`people-avatar-sync-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users_access' },
        (payload) => applyUserUpdate(payload.new as Record<string, any>),
      )
      .subscribe();

    window.addEventListener('focus', refreshAll);
    window.addEventListener('pageshow', refreshAll);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshAll);
      window.removeEventListener('pageshow', refreshAll);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [fetchAll]);'''
    anchor = """  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAll]);"""
    people = replace_once(people, anchor, anchor + people_effect, 'people realtime effect')
    people = replace_once(
        people,
        '// FERRAMENTARIA_AVATAR_SYNC_V1\n',
        '// FERRAMENTARIA_AVATAR_SYNC_V1\n' + MARKER + '\n',
        'people realtime marker',
    )
    PEOPLE.write_text(people, encoding='utf-8')
    print('People avatar realtime synchronization applied.')
else:
    print('People avatar realtime synchronization already applied.')

external = EXTERNAL.read_text(encoding='utf-8')
if MARKER not in external:
    external = replace_once(
        external,
        "    let auditCache: any = null;\n",
        "    let auditCache: any = null;\n    let avatarChannel: any = null;\n",
        'external avatar channel state',
    )
    old_fetch = """    void fetchAudit(auditId)
      .then((audit) => {
        auditCache = audit;
        patchPage();
      })
      .catch((error) => console.error('Falha ao sincronizar comprovante externo:', error));"""
    new_fetch = """    void fetchAudit(auditId)
      .then((audit) => {
        auditCache = audit;
        patchPage();
        const registration = String(auditCache?.users_access?.registration || auditCache?.user_id || '').trim();
        if (registration) {
          avatarChannel = supabase
            .channel(`external-avatar-sync-${auditId}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'users_access',
                filter: `registration=eq.${registration}`,
              },
              () => {
                void fetchAudit(auditId).then((updatedAudit) => {
                  auditCache = updatedAudit;
                  patchPage();
                });
              },
            )
            .subscribe();
        }
      })
      .catch((error) => console.error('Falha ao sincronizar comprovante externo:', error));"""
    external = replace_once(external, old_fetch, new_fetch, 'external realtime subscription')
    external = replace_once(
        external,
        "      observer.disconnect();\n",
        "      observer.disconnect();\n      if (avatarChannel) void supabase.removeChannel(avatarChannel);\n",
        'external realtime cleanup',
    )
    external = replace_once(
        external,
        '// FERRAMENTARIA_AVATAR_PICKER_V3\n',
        '// FERRAMENTARIA_AVATAR_PICKER_V3\n' + MARKER + '\n',
        'external realtime marker',
    )
    EXTERNAL.write_text(external, encoding='utf-8')
    print('External link avatar realtime synchronization applied.')
else:
    print('External link avatar realtime synchronization already applied.')
