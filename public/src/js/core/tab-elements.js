/**
 * Element tab icons — inline SVG + CSS rituals.
 * Why not Lottie/Rive: PWA perf, zero deps, offline, maintainable with Lucide chrome.
 * hydrateIcons skips [data-tab-element] / [data-icon-skip].
 */
(function () {
  'use strict';

  const SVGS = {
    peepal: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-peepal">
      <defs>
        <linearGradient id="elPeepalCanopy" x1="4" y1="3" x2="20" y2="16" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7CDB6A"/><stop offset=".55" stop-color="#2F9E44"/><stop offset="1" stop-color="#1B6B2F"/>
        </linearGradient>
        <linearGradient id="elPeepalTrunk" x1="11" y1="14" x2="14" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#A67C52"/><stop offset="1" stop-color="#6B4423"/>
        </linearGradient>
      </defs>
      <ellipse class="el-idle el-leaf-1" cx="8.2" cy="9.2" rx="3.2" ry="2.1" fill="#4CAF50" opacity=".9" transform="rotate(-28 8.2 9.2)"/>
      <ellipse class="el-idle el-leaf-2" cx="15.6" cy="8.4" rx="3.4" ry="2.2" fill="#66BB6A" opacity=".95" transform="rotate(22 15.6 8.4)"/>
      <ellipse class="el-idle el-leaf-3" cx="12" cy="5.6" rx="3.8" ry="2.4" fill="url(#elPeepalCanopy)"/>
      <path d="M12 10.5c1.2 1.8 1.6 3.6 1.7 6.2.1 1.4-.1 3.2-.2 5.3h-2.8c-.1-2-.3-3.9-.2-5.4.2-2.5.7-4.3 1.5-6.1z" fill="url(#elPeepalTrunk)"/>
      <circle cx="10.2" cy="12.8" r="1.1" fill="#FFC93C" opacity=".85"/>
    </svg>`,

    duniya: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-duniya">
      <defs>
        <linearGradient id="elGlobe" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stop-color="#6EB6FF"/><stop offset=".5" stop-color="#2A6FDB"/><stop offset="1" stop-color="#1A3F8F"/>
        </linearGradient>
        <linearGradient id="elSheen" x1="7" y1="5" x2="14" y2="14" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <circle class="el-idle el-ring" cx="12" cy="12" r="10.2" fill="none" stroke="#7EC8FF" stroke-width="1.2" stroke-dasharray="4 3" opacity=".75"/>
      <circle class="el-idle el-globe" cx="12" cy="12" r="8.2" fill="url(#elGlobe)"/>
      <ellipse class="el-idle el-globe" cx="12" cy="12" rx="3.4" ry="8.2" fill="none" stroke="#B8E0FF" stroke-width=".9" opacity=".7"/>
      <path class="el-idle el-globe" d="M4.2 12h15.6M6.2 8.2h11.6M6.2 15.8h11.6" fill="none" stroke="#B8E0FF" stroke-width=".8" opacity=".65"/>
      <ellipse class="el-idle el-globe" cx="9.2" cy="8.6" rx="2.4" ry="1.5" fill="url(#elSheen)"/>
    </svg>`,

    baithak: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-baithak">
      <defs>
        <linearGradient id="elCafe" x1="5" y1="8" x2="19" y2="20" gradientUnits="userSpaceOnUse">
          <stop stop-color="#E8B86D"/><stop offset=".55" stop-color="#C47A3A"/><stop offset="1" stop-color="#8B4E1F"/>
        </linearGradient>
      </defs>
      <path class="el-idle el-steam-1" d="M9.2 7.2c.4-1.2-.2-2 .4-3" fill="none" stroke="#A8C5D8" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
      <path class="el-idle el-steam-2" d="M12.2 6.6c.5-1.3-.1-2.2.5-3.4" fill="none" stroke="#C5D9E8" stroke-width="1.2" stroke-linecap="round" opacity=".65"/>
      <g class="el-cafe">
        <path d="M6.5 10.2h9.2a1.6 1.6 0 0 1 1.6 1.6v.4c0 3.2-2.4 5.8-5.4 6.2H10c-2.8-.2-5.1-2.6-5.1-5.6v-1a1.6 1.6 0 0 1 1.6-1.6z" fill="url(#elCafe)"/>
        <path d="M17 11.4h1.4a2.2 2.2 0 0 1 0 4.4H17" fill="none" stroke="#A86A2E" stroke-width="1.4" stroke-linecap="round"/>
        <ellipse cx="11.2" cy="10.4" rx="4.2" ry="1.2" fill="#F3D5A5" opacity=".9"/>
        <rect x="7.2" y="18.4" width="9.2" height="1.6" rx=".8" fill="#8B5A2B" opacity=".85"/>
      </g>
    </svg>`,

    akhbaar: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-akhbaar">
      <defs>
        <linearGradient id="elPaper" x1="3" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stop-color="#F7F0FF"/><stop offset=".45" stop-color="#D4B8F5"/><stop offset="1" stop-color="#7B2CBF"/>
        </linearGradient>
      </defs>
      <rect x="3.5" y="4" width="14" height="16" rx="2" fill="url(#elPaper)" stroke="#5A189A" stroke-width=".6"/>
      <g class="el-idle el-page">
        <rect x="8.5" y="3.2" width="12" height="15.6" rx="1.8" fill="#EDE4FF" stroke="#9B5DE5" stroke-width=".7"/>
        <rect x="10.4" y="5.4" width="8" height="2.2" rx=".5" fill="#7B2CBF" opacity=".85"/>
        <path d="M10.6 10h7.6M10.6 12.4h7.6M10.6 14.8h5.2" stroke="#9B5DE5" stroke-width="1" stroke-linecap="round" opacity=".7"/>
      </g>
      <path d="M5.6 7.2h5.2M5.6 9.6h5.2M5.6 12h3.6" stroke="#5A189A" stroke-width=".9" stroke-linecap="round" opacity=".55"/>
    </svg>`,

    dangal: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-dangal">
      <defs>
        <linearGradient id="elFire" x1="6" y1="4" x2="18" y2="20" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFD166"/><stop offset=".4" stop-color="#FF7A18"/><stop offset="1" stop-color="#D00000"/>
        </linearGradient>
        <linearGradient id="elGem" x1="9" y1="8" x2="15" y2="16" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFE08A"/><stop offset="1" stop-color="#FF9A3C"/>
        </linearGradient>
      </defs>
      <polygon class="el-idle el-core" points="12,3.2 19.2,8.2 16.6,16.8 7.4,16.8 4.8,8.2" fill="url(#elFire)" stroke="#9A3412" stroke-width=".5"/>
      <polygon class="el-idle el-core" points="12,6.2 15.6,9 14.2,13.4 9.8,13.4 8.4,9" fill="url(#elGem)"/>
      <circle class="el-idle el-spark" cx="12" cy="10.8" r="1.35" fill="#FFF3BF"/>
      <circle class="el-idle el-spark" cx="6.2" cy="6.4" r=".7" fill="#FFD166"/>
      <circle class="el-idle el-spark" cx="18.2" cy="7.2" r=".55" fill="#FF9A3C"/>
      <circle class="el-idle el-spark" cx="16.8" cy="15.2" r=".6" fill="#FFD166"/>
      <path d="M8.2 18.6h7.6" stroke="#9A3412" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    </svg>`,
  };

  function quietOrReduced() {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return true;
      if (typeof Micro !== 'undefined' && Micro.prefersReducedMotion && Micro.prefersReducedMotion()) return true;
      return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (e) {
      return false;
    }
  }

  function syncQuietClass() {
    try {
      document.documentElement.classList.toggle('quiet-mode', !!quietMode);
    } catch (e) {}
  }

  function mountIcon(el, tab) {
    if (!el || !SVGS[tab]) return;
    el.classList.add('tab-el-icon');
    el.setAttribute('data-tab-element', tab);
    el.setAttribute('data-icon-skip', '1');
    el.removeAttribute('data-icon');
    delete el.dataset.iconHydrated;
    el.innerHTML = SVGS[tab];
  }

  function mountAll(root) {
    syncQuietClass();
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.tab-btn[data-tab] .tab-icon, [data-tab-element]').forEach((el) => {
      const tab =
        el.getAttribute('data-tab-element') ||
        el.closest('.tab-btn')?.dataset?.tab ||
        '';
      if (!SVGS[tab]) return;
      // Skip while morph shortcuts own the slot
      if (el.closest('.tab-btn.is-shortcut')) return;
      if (el.querySelector('.tab-el-svg') && el.getAttribute('data-tab-element') === tab) return;
      mountIcon(el, tab);
    });
  }

  function playRitual(tab) {
    if (quietOrReduced()) return;
    const btn = document.querySelector(`.bottom-tabs .tab-btn[data-tab="${tab}"]`);
    const icon = btn?.querySelector('.tab-el-icon, .tab-icon');
    if (!icon) return;
    if (!icon.querySelector('.tab-el-svg')) mountIcon(icon, tab);
    icon.classList.remove('is-ritual');
    void icon.offsetWidth;
    icon.classList.add('is-ritual');
    setTimeout(() => icon.classList.remove('is-ritual'), 1000);
    try {
      if (typeof SoundLib !== 'undefined' && SoundLib.element) SoundLib.element(tab, 'ritual');
    } catch (e) {}
  }

  function playAmbience(tab) {
    if (quietOrReduced()) return;
    try {
      if (typeof SoundLib !== 'undefined' && SoundLib.element) SoundLib.element(tab, 'ambience');
    } catch (e) {}
  }

  window.TabElements = {
    SVGS,
    mountAll,
    mountIcon,
    playRitual,
    playAmbience,
    syncQuietClass,
  };

  function boot() {
    mountAll();
    syncQuietClass();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
