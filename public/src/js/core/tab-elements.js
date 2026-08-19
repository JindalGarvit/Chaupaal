/**
 * Element tab icons — inline SVG + CSS rituals + morph shortcut glyphs.
 * Why not Lottie/Rive: PWA perf, zero deps, offline, maintainable with Lucide chrome.
 * hydrateIcons skips [data-tab-element] / [data-icon-skip].
 */
(function () {
  'use strict';

  const SVGS = {
    peepal: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-peepal">
      <defs>
        <linearGradient id="elPeepalCanopy" x1="3" y1="2" x2="20" y2="14" gradientUnits="userSpaceOnUse">
          <stop stop-color="#9BE86A"/><stop offset=".4" stop-color="#3CB54A"/><stop offset="1" stop-color="#1A5C28"/>
        </linearGradient>
        <linearGradient id="elPeepalTrunk" x1="11" y1="12" x2="14" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#C4A484"/><stop offset=".55" stop-color="#8B5E3C"/><stop offset="1" stop-color="#5C3A1E"/>
        </linearGradient>
        <radialGradient id="elPeepalGlow" cx="12" cy="8" r="9" gradientUnits="userSpaceOnUse">
          <stop stop-color="#B8F090" stop-opacity=".45"/><stop offset="1" stop-color="#2F9E44" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="12" cy="9" rx="9.5" ry="7.2" fill="url(#elPeepalGlow)"/>
      <ellipse class="el-idle el-leaf-1" cx="5.6" cy="11" rx="3.2" ry="2" fill="#43A047" opacity=".9" transform="rotate(-38 5.6 11)"/>
      <ellipse class="el-idle el-leaf-1" cx="6.8" cy="10.2" rx="3.6" ry="2.3" fill="#4CAF50" opacity=".92" transform="rotate(-32 6.8 10.2)"/>
      <ellipse class="el-idle el-leaf-2" cx="17.4" cy="10.4" rx="3.2" ry="2" fill="#2E7D32" opacity=".88" transform="rotate(34 17.4 10.4)"/>
      <ellipse class="el-idle el-leaf-2" cx="16.8" cy="9.2" rx="3.8" ry="2.4" fill="#66BB6A" opacity=".95" transform="rotate(26 16.8 9.2)"/>
      <ellipse class="el-idle el-leaf-4" cx="9.2" cy="6.4" rx="3.2" ry="2" fill="#81C784" opacity=".9" transform="rotate(-12 9.2 6.4)"/>
      <ellipse class="el-idle el-leaf-3" cx="14.2" cy="6" rx="3" ry="1.9" fill="#66BB6A" opacity=".85" transform="rotate(14 14.2 6)"/>
      <ellipse class="el-idle el-leaf-3" cx="12.2" cy="5.2" rx="4.4" ry="2.8" fill="url(#elPeepalCanopy)"/>
      <path d="M12 9.8c1.4 2 1.8 4 1.9 6.8.1 1.5-.1 3.4-.2 5.4h-3.2c-.1-2-.3-4-.2-5.5.2-2.7.8-4.6 1.7-6.7z" fill="url(#elPeepalTrunk)"/>
      <path d="M11.2 14.2c-1.2.6-2.4 1.8-2.8 3.2" fill="none" stroke="#6B4423" stroke-width=".7" stroke-linecap="round" opacity=".55"/>
      <path d="M13.2 13.8c1 .5 2 1.4 2.4 2.6" fill="none" stroke="#6B4423" stroke-width=".7" stroke-linecap="round" opacity=".45"/>
      <circle class="el-idle el-fruit" cx="9.6" cy="12.6" r="1.15" fill="#FFC93C"/>
      <circle class="el-idle el-fruit" cx="14.4" cy="11.8" r=".85" fill="#FFB703" opacity=".9"/>
      <circle class="el-idle el-fruit" cx="11.2" cy="10.4" r=".55" fill="#FFE082" opacity=".8"/>
      <ellipse cx="10.6" cy="4.2" rx="1.6" ry=".9" fill="#fff" opacity=".22"/>
    </svg>`,

    duniya: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-duniya">
      <defs>
        <linearGradient id="elGlobe" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stop-color="#8EC8FF"/><stop offset=".45" stop-color="#2A6FDB"/><stop offset="1" stop-color="#143A7A"/>
        </linearGradient>
        <linearGradient id="elSheen" x1="7" y1="5" x2="14" y2="14" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="elRing" x1="2" y1="10" x2="22" y2="14" gradientUnits="userSpaceOnUse">
          <stop stop-color="#C9E8FF"/><stop offset=".5" stop-color="#7EC8FF"/><stop offset="1" stop-color="#4A90D9"/>
        </linearGradient>
        <clipPath id="elGlobeClip"><circle cx="12" cy="11.2" r="7.2"/></clipPath>
      </defs>
      <!-- Saturn ring far arc (behind globe) -->
      <ellipse class="el-idle el-ring-back" cx="12" cy="12.2" rx="11.2" ry="3.4" fill="none" stroke="url(#elRing)" stroke-width="1.35" opacity=".55" transform="rotate(-22 12 12.2)"/>
      <circle class="el-idle el-globe" cx="12" cy="11.2" r="7.2" fill="url(#elGlobe)"/>
      <g class="el-idle el-globe" clip-path="url(#elGlobeClip)">
        <ellipse cx="12" cy="11.2" rx="2.9" ry="7.2" fill="none" stroke="#B8E0FF" stroke-width=".85" opacity=".75"/>
        <path d="M4.9 11.2h14.2M6.6 7.6h10.8M6.6 14.8h10.8" fill="none" stroke="#B8E0FF" stroke-width=".75" opacity=".65"/>
        <ellipse cx="9.4" cy="8.2" rx="2.2" ry="1.4" fill="#3D8B5A" opacity=".55"/>
        <ellipse cx="14.6" cy="13.4" rx="1.8" ry="1.1" fill="#2E7D4F" opacity=".45"/>
      </g>
      <ellipse class="el-idle el-globe" cx="9.5" cy="8.4" rx="2.2" ry="1.4" fill="url(#elSheen)"/>
      <!-- Near ring arc (in front) with depth highlight -->
      <path class="el-idle el-ring-front" d="M2.2 13.6c1.8 2.4 5.6 3.8 9.8 3.8s8-1.4 9.8-3.8" fill="none" stroke="url(#elRing)" stroke-width="1.7" stroke-linecap="round" opacity=".95" transform="rotate(-22 12 12.2)"/>
      <path class="el-idle el-ring-front" d="M3.4 13.2c1.6 1.8 4.8 2.9 8.6 2.9s7-1.1 8.6-2.9" fill="none" stroke="#fff" stroke-width=".55" opacity=".35" transform="rotate(-22 12 12.2)"/>
    </svg>`,

    baithak: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-baithak">
      <defs>
        <linearGradient id="elCafe" x1="5" y1="8" x2="19" y2="20" gradientUnits="userSpaceOnUse">
          <stop stop-color="#F0C98A"/><stop offset=".45" stop-color="#C47A3A"/><stop offset="1" stop-color="#7A3E16"/>
        </linearGradient>
        <linearGradient id="elTable" x1="5" y1="18" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop stop-color="#A67C52"/><stop offset="1" stop-color="#5C3A1E"/>
        </linearGradient>
        <radialGradient id="elCupHighlight" cx="10" cy="11" r="5" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="12" cy="20.2" rx="7" ry="1.1" fill="#8B5A2B" opacity=".25"/>
      <path class="el-idle el-steam-1" d="M8.8 7c.5-1.4-.3-2.2.5-3.4" fill="none" stroke="#A8C5D8" stroke-width="1.25" stroke-linecap="round" opacity=".75"/>
      <path class="el-idle el-steam-2" d="M11.8 6.2c.55-1.5-.2-2.4.55-3.8" fill="none" stroke="#C5D9E8" stroke-width="1.25" stroke-linecap="round" opacity=".7"/>
      <path class="el-idle el-steam-3" d="M14.6 7.1c.45-1.2-.15-2 .4-3.1" fill="none" stroke="#B8D0E0" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>
      <g class="el-cafe">
        <ellipse cx="11" cy="19.6" rx="6.2" ry="1.35" fill="url(#elTable)"/>
        <path d="M6.2 10h9.6a1.8 1.8 0 0 1 1.8 1.8v.5c0 3.4-2.6 6.1-5.8 6.5H10c-3-.2-5.4-2.8-5.4-6v-1.1A1.8 1.8 0 0 1 6.2 10z" fill="url(#elCafe)"/>
        <path d="M17.2 11.6h1.6a2.4 2.4 0 0 1 0 4.8H17.2" fill="none" stroke="#A86A2E" stroke-width="1.45" stroke-linecap="round"/>
        <ellipse cx="11.2" cy="10.2" rx="4.4" ry="1.35" fill="#F8E0B8" opacity=".95"/>
        <ellipse cx="10.2" cy="12.4" rx="2.4" ry="1.8" fill="url(#elCupHighlight)"/>
        <rect x="8.2" y="17.8" width="1.1" height="1.6" rx=".4" fill="#6B4423" opacity=".7"/>
        <rect x="13.4" y="17.8" width="1.1" height="1.6" rx=".4" fill="#6B4423" opacity=".7"/>
      </g>
    </svg>`,

    akhbaar: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-akhbaar">
      <defs>
        <linearGradient id="elPaperBack" x1="2" y1="3" x2="18" y2="20" gradientUnits="userSpaceOnUse">
          <stop stop-color="#E8D5FF"/><stop offset="1" stop-color="#5A189A"/>
        </linearGradient>
        <linearGradient id="elPaperFront" x1="6" y1="2" x2="22" y2="18" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFFEFF"/><stop offset=".4" stop-color="#EDE4FF"/><stop offset="1" stop-color="#9B5DE5"/>
        </linearGradient>
      </defs>
      <rect class="el-idle el-page-back" x="2.8" y="4.4" width="13.2" height="15.2" rx="1.8" fill="url(#elPaperBack)" stroke="#5A189A" stroke-width=".55" transform="rotate(-6 9.4 12)"/>
      <g class="el-idle el-page">
        <rect x="7.2" y="2.8" width="13.6" height="16.4" rx="1.9" fill="url(#elPaperFront)" stroke="#7B2CBF" stroke-width=".7"/>
        <rect x="9.2" y="5" width="9.4" height="2.6" rx=".55" fill="#7B2CBF" opacity=".88"/>
        <path d="M9.4 10h9M9.4 12.6h9M9.4 15.2h6.2" stroke="#9B5DE5" stroke-width="1.05" stroke-linecap="round" opacity=".75"/>
        <rect x="9.4" y="17.2" width="4.2" height="1.1" rx=".4" fill="#C77DFF" opacity=".7"/>
      </g>
      <path class="el-idle el-page-fold" d="M18.2 3.2l2.2 2.4v1.6" fill="none" stroke="#5A189A" stroke-width=".7" opacity=".35"/>
    </svg>`,

    dangal: `<svg viewBox="0 0 24 24" aria-hidden="true" class="tab-el-svg tab-el-dangal">
      <defs>
        <linearGradient id="elFire" x1="6" y1="3" x2="18" y2="20" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFE566"/><stop offset=".35" stop-color="#FF7A18"/><stop offset="1" stop-color="#B00000"/>
        </linearGradient>
        <linearGradient id="elGem" x1="9" y1="7" x2="15" y2="16" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFF3BF"/><stop offset="1" stop-color="#FF9A3C"/>
        </linearGradient>
        <filter id="elSparkGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation=".4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <polygon class="el-idle el-core" points="12,2.6 16.2,6.4 19.4,7.8 16.8,16.6 12,20.4 7.2,16.6 4.6,7.8 7.8,6.4" fill="url(#elFire)" stroke="#9A3412" stroke-width=".45"/>
      <polygon class="el-idle el-core" points="12,5.8 15.4,8.6 14.2,13.6 9.8,13.6 8.6,8.6" fill="url(#elGem)"/>
      <path d="M12 5.8v7.8M8.6 8.6l6.8 0" stroke="#FF7A18" stroke-width=".55" opacity=".55"/>
      <circle class="el-idle el-spark" cx="12" cy="10.6" r="1.4" fill="#FFF8E7" filter="url(#elSparkGlow)"/>
      <circle class="el-idle el-spark" cx="5.6" cy="5.8" r=".75" fill="#FFD166"/>
      <circle class="el-idle el-spark" cx="18.6" cy="6.6" r=".6" fill="#FF9A3C"/>
      <circle class="el-idle el-spark" cx="17.2" cy="15.6" r=".65" fill="#FFE566"/>
      <circle class="el-idle el-spark" cx="6.4" cy="15" r=".5" fill="#FF7A18"/>
      <path d="M7.8 19.2h8.4" stroke="#9A3412" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
    </svg>`,
  };

  /** Theme-native morph shortcut glyphs (same visual language as element tabs). */
  const SHORTCUT_SVGS = {
    // Peepal (earth)
    discuss: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><defs><linearGradient id="scPen" x1="4" y1="4" x2="20" y2="20"><stop stop-color="#9BE86A"/><stop offset="1" stop-color="#1B6B2F"/></linearGradient></defs><path d="M5 19l1.2-4.2L16.8 4.2a2 2 0 0 1 2.8 2.8L9.2 17.4z" fill="url(#scPen)"/><circle cx="18.2" cy="5.8" r="1.4" fill="#FFC93C"/></svg>`,
    khoj: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="#2F9E44" stroke-width="2"/><path d="M15.2 15.2L20 20" stroke="#1B6B2F" stroke-width="2.2" stroke-linecap="round"/><circle cx="10.5" cy="10.5" r="2.4" fill="#66BB6A" opacity=".5"/></svg>`,
    vriksha: null, // uses peepal tab SVG
    mashhoor: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M4 16l4-5 3.5 3 4.5-7 4 9" fill="none" stroke="#2F9E44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="7" r="2" fill="#FFC93C"/></svg>`,
    // Baithak Find people — sky/gold tones (match Instant / Mitra / Sabha), not Peepal green
    find: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><circle cx="9" cy="9" r="3.2" fill="#E8B86D"/><circle cx="15.5" cy="9.5" r="2.8" fill="#C47A3A"/><path d="M4.5 18c1.2-2.4 3-3.6 4.5-3.6S12.3 15.6 13.5 18M13 18c.8-1.6 2-2.4 3-2.4s2 .7 2.8 2" fill="none" stroke="#8B5A2B" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    search: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="#2F9E44" stroke-width="2"/><path d="M15.2 15.2L20 20" stroke="#1B6B2F" stroke-width="2.2" stroke-linecap="round"/><rect x="8" y="8" width="5" height="5" rx="1" fill="#66BB6A" opacity=".45"/></svg>`,
    // Akhbaar (air)
    today: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><defs><linearGradient id="scAir" x1="4" y1="4" x2="20" y2="20"><stop stop-color="#E8D5FF"/><stop offset="1" stop-color="#7B2CBF"/></linearGradient></defs><path d="M5 14c2-4 5-6 7-6s5 2 7 6" fill="none" stroke="url(#scAir)" stroke-width="1.8" stroke-linecap="round"/><path d="M7 17c1.5-2.5 3.5-3.8 5-3.8s3.5 1.3 5 3.8" fill="none" stroke="#9B5DE5" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="8" r="2.2" fill="#C77DFF"/></svg>`,
    safar: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M5 18c2-4 4.5-6.5 7-6.5s5 2.5 7 6.5" fill="none" stroke="#C77DFF" stroke-width="1.8" stroke-linecap="round"/><path d="M7 14c1.5-2.5 3-4 5-4s3.5 1.5 5 4" fill="none" stroke="#9B5DE5" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="7" r="2.4" fill="#FFD166"/><circle cx="12" cy="7" r="1" fill="#E8A800"/></svg>`,
    surkhiya: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="#EDE4FF" stroke="#7B2CBF" stroke-width="1"/><rect x="6" y="7.5" width="8" height="2.2" rx=".4" fill="#7B2CBF"/><path d="M6 12h12M6 15h9" stroke="#9B5DE5" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    all: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.2" fill="#F7F0FF" stroke="#5A189A" stroke-width=".8"/><path d="M7 9h10M7 12.5h10M7 16h6" stroke="#7B2CBF" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    saathi: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><circle cx="9" cy="9" r="3" fill="#9B5DE5"/><circle cx="15.5" cy="9.5" r="2.6" fill="#C77DFF"/><path d="M4.8 18c1-2.2 2.6-3.4 4.2-3.4s3.2 1.2 4.2 3.4M13.2 18c.7-1.5 1.8-2.3 2.8-2.3s1.9.7 2.6 2" fill="none" stroke="#5A189A" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    addcat: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="#EDE4FF" stroke="#7B2CBF" stroke-width="1.2"/><path d="M12 8v8M8 12h8" stroke="#7B2CBF" stroke-width="2" stroke-linecap="round"/></svg>`,
    quiz: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M8 4h8a2 2 0 0 1 2 2v12l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" fill="#EDE4FF" stroke="#7B2CBF" stroke-width="1.1"/><path d="M10 10h4M10 13h3" stroke="#9B5DE5" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    // Duniya (water)
    post: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="#2A6FDB" opacity=".2"/><path d="M12 7v10M7 12h10" stroke="#2A6FDB" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    vishwa: null,
    lehar: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M3 14c2.5-3 4.5-4.5 6.5-4.5S13.5 12.5 16 14s4.5 2 5 1.5" fill="none" stroke="#2A6FDB" stroke-width="1.8" stroke-linecap="round"/><path d="M3 17c2.5-2.2 4.5-3.2 6.5-3.2S13.5 16 16 17.2 20.5 19 21 18.5" fill="none" stroke="#6EB6FF" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    prasidha: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M5 16l3.5-5 3 3.5L16 7l3 9" fill="none" stroke="#2A6FDB" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="7" r="2.1" fill="#6EB6FF"/></svg>`,
    story: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="3" fill="#6EB6FF" opacity=".25" stroke="#2A6FDB" stroke-width="1.3"/><circle cx="12" cy="11" r="3.2" fill="none" stroke="#2A6FDB" stroke-width="1.5"/><circle cx="12" cy="11" r="1.2" fill="#2A6FDB"/></svg>`,
    // Baithak (sky)
    sambhavanayein: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M6 16c2-5 5-7 8-7 1.5 0 3 .6 4 1.6" fill="none" stroke="#C47A3A" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="9" r="2.4" fill="#E8B86D"/><circle cx="16" cy="10" r="2" fill="#C47A3A" opacity=".7"/></svg>`,
    sabha: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M5 18V9l7-4 7 4v9" fill="#E8B86D" opacity=".35"/><path d="M5 9l7-4 7 4M8 18V11h8v7" fill="none" stroke="#C47A3A" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    mitra: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M8 13c1.5 2 3 3 4 3s2.5-1 4-3" fill="none" stroke="#C47A3A" stroke-width="1.8" stroke-linecap="round"/><circle cx="8.5" cy="9" r="2.6" fill="#E8B86D"/><circle cx="15.5" cy="9" r="2.6" fill="#C47A3A"/></svg>`,
    // Dangal (fire)
    pulse: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M3 12h4l2-5 3 10 2-5h7" fill="none" stroke="#E85D04" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="7" r="2" fill="#FFD166"/></svg>`,
    khel: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><path d="M12 3l2.2 4.6L19 8.2l-3.5 3.4.8 4.9L12 14.2 7.7 16.5l.8-4.9L5 8.2l4.8-.6z" fill="#FF7A18" stroke="#9A3412" stroke-width=".6"/></svg>`,
    manch: null,
    maidan: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2.5" fill="#FFD166" opacity=".35" stroke="#E85D04" stroke-width="1.3"/><path d="M9 12h6M12 9v6" stroke="#E85D04" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    challenge: `<svg viewBox="0 0 24 24" class="tab-sc-svg" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="#E85D04" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#FF7A18" stroke-width="1.3"/><circle cx="12" cy="12" r="1.6" fill="#FFD166"/></svg>`,
  };

  const TAB_FALLBACK = { vriksha: 'peepal', vishwa: 'duniya', manch: 'dangal' };

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
    el.classList.remove('tab-sc-icon');
    el.setAttribute('data-tab-element', tab);
    el.setAttribute('data-icon-skip', '1');
    el.removeAttribute('data-icon');
    el.removeAttribute('data-shortcut-icon');
    delete el.dataset.iconHydrated;
    el.innerHTML = SVGS[tab];
  }

  function mountShortcutIcon(el, shortcutId, tab) {
    if (!el) return;
    const fallbackTab = TAB_FALLBACK[shortcutId] || tab;
    const svg =
      SHORTCUT_SVGS[shortcutId] ||
      (SHORTCUT_SVGS[shortcutId] === null ? SVGS[fallbackTab] : null) ||
      SVGS[fallbackTab] ||
      SVGS[tab];
    if (!svg) return;
    el.classList.add('tab-el-icon', 'tab-sc-icon');
    el.setAttribute('data-icon-skip', '1');
    el.setAttribute('data-shortcut-icon', shortcutId);
    el.removeAttribute('data-tab-element');
    el.removeAttribute('data-icon');
    delete el.dataset.iconHydrated;
    el.innerHTML = svg;
  }

  function markHtml(tab, size) {
    const svg = SVGS[tab];
    if (!svg) return '';
    const px = Number(size) || 24;
    return `<span class="tab-el-icon cp-tab-mark-host" data-tab-element="${tab}" data-icon-skip="1" style="width:${px}px;height:${px}px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;">${svg}</span>`;
  }

  function mountMarks(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-tab-mark]').forEach((el) => {
      const tab = el.getAttribute('data-tab-mark');
      if (!SVGS[tab]) return;
      if (el.querySelector('.tab-el-svg')) return;
      const size = Number(el.getAttribute('data-mark-size')) || 16;
      el.innerHTML = markHtml(tab, size);
      el.removeAttribute('data-tab-mark');
    });
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
      if (el.closest('.tab-btn.is-shortcut')) return;
      if (el.querySelector('.tab-el-svg') && el.getAttribute('data-tab-element') === tab) return;
      mountIcon(el, tab);
    });
    mountMarks(scope);
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
    setTimeout(() => icon.classList.remove('is-ritual'), 1100);
    try {
      if (typeof SoundLib !== 'undefined' && SoundLib.element) SoundLib.element(tab, 'ritual');
    } catch (e) {}
  }

  function playAmbience(tab) {
    if (quietOrReduced()) return;
    const bar = document.querySelector('.bottom-tabs');
    if (bar) {
      bar.classList.remove('is-morph-fx');
      void bar.offsetWidth;
      bar.classList.add('is-morph-fx');
      setTimeout(() => bar.classList.remove('is-morph-fx'), 2100);
    }
    try {
      if (typeof SoundLib !== 'undefined' && SoundLib.element) SoundLib.element(tab, 'ambience');
    } catch (e) {}
  }

  window.TabElements = {
    SVGS,
    SHORTCUT_SVGS,
    mountAll,
    mountIcon,
    mountShortcutIcon,
    mountMarks,
    markHtml,
    playRitual,
    playAmbience,
    syncQuietClass,
  };

  function boot() {
    mountAll();
    syncQuietClass();
    // Remount if something wiped empty icon slots (SW race / late DOM)
    setTimeout(mountAll, 0);
    setTimeout(mountAll, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.addEventListener('pageshow', () => {
    try {
      mountAll();
    } catch (e) {}
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try {
        mountAll();
      } catch (e) {}
    }
  });
})();
