/**
 * Namespace global de l'application + bus d'événements minimal.
 * Scripts classiques (pas de modules ES) pour fonctionner en file://.
 */
(function (global) {
  'use strict';

  const listeners = new Map();

  const bus = {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event).delete(handler);
    },
    emit(event, payload) {
      (listeners.get(event) || []).forEach((handler) => handler(payload));
    },
  };

  global.SP = {
    bus,
    core: {},
    parsers: {},
    analysis: {},
    charts: {},
    silhouette: {},
    ui: {},
  };
})(window);
