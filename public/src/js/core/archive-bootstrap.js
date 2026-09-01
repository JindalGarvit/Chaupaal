/**
 * Re-bind window.openArchive after late-loaded scripts (e.g. duniya.js).
 * Must load after archive-hub.js and duniya.js.
 */
(function () {
  'use strict';
  if (typeof openArchiveHub !== 'function') {
    console.error('[archive-bootstrap] openArchiveHub is not defined');
    return;
  }
  window.openArchiveHub = openArchiveHub;
  window.openArchive = function openArchive() {
    return openArchiveHub('journal');
  };
})();
