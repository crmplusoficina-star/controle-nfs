'use client';

/**
 * Hotfix de estabilidade.
 *
 * A integração anterior manipulava a árvore DOM da tela de Cautelas por meio
 * de MutationObserver. Em páginas com muitos itens, as próprias alterações do
 * componente disparavam novas varreduras continuamente, bloqueando a thread
 * principal do navegador.
 *
 * O estado assinado continua preservado no Supabase compartilhado e no app
 * Ferramentaria. Esta camada visual fica desativada até ser reintegrada sem
 * mutações globais no DOM.
 */
export function CauteliaToolboxSeparation() {
  return null;
}
