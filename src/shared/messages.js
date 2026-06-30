/**
 * Message action names exchanged between the popup/manager and the
 * background service worker. Centralised to avoid string typos.
 * @module shared/messages
 */
export const MSG = Object.freeze({
  CAPTURE: 'capture',
  CAPTURE_CURRENT: 'captureCurrent',
  CANCEL: 'cancelCapture',
  RECAPTURE: 'recaptureTab',
  GET_STATE: 'getCaptureState',
  LIST_TABS: 'listTabs',
  // broadcasts from background
  PROGRESS: 'captureProgress',
  DONE: 'captureDone',
  ERROR: 'captureError',
});
