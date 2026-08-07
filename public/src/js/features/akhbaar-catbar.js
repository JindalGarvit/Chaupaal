// ===================== AKHBAAR CATEGORY BAR =====================
// Order: Khabar → Saathi → others → Add (Add is control only — not in swipe walk)
let akhbaarActiveCat = 'all';

/** Relevant color tints for category chip icons (not plain mono). */
const AKHBAAR_CAT_COLORS = {
  all: '#7B2CBF',
  saathi: '#E63946',
  GK: '#1565C0',
  Sports: '#2E7D32',
  Tech: '#00838F',
  Business: '#EF6C00',
  India: '#C62828',
  World: '#283593',
  Cricket: '#43A047',
  Bollywood: '#D81B60',
  'Food & Recipes': '#F57C00',
  Automobiles: '#455A64',
  Gadgets: '#00ACC1',
  'Personal Finance': '#6A1B9A',
  Gaming: '#5E35B1',
  Travel: '#00897B',
  Environment: '#558B2F',
  Music: '#AD1457',
  Football: '#1B5E20',
  Fitness: '#E65100',
  Fashion: '#C2185B',
  Science: '#0277BD',
  Entertainment: '#F9A825',
  Education: '#3949AB',
  'Real Estate': '#6D4C41',
  Agriculture: '#689F38',
  'Law & Justice': '#37474F',
  'Art & Culture': '#8E24AA',
};

function tintAkhbaarChip(chip) {
  if (!chip) return;
  const cat = chip.dataset.cat || '';
  if (cat === 'add') return;
  const color = AKHBAAR_CAT_COLORS[cat] || '#7B2CBF';
  chip.style.setProperty('--cat-tint', color);
  chip.classList.add('akhbaar-cat-chip--tinted');
  const icon = chip.querySelector('[data-icon], .cp-icon, svg');
  if (icon) {
    icon.style.color = color;
    icon.style.stroke = color;
  }
}

function initAkhbaarCatBar() {
  const bar = document.getElementById('akhbaarCatBar');
  if (!bar || bar.dataset.wired) return;
  bar.dataset.wired = '1';
  bar.setAttribute('data-swipe-ignore', '1');

  ensureSaathiChip(bar);

  // Personalized extras (user + suggested) from CategoryPrefs
  try {
    if (typeof CategoryPrefs !== 'undefined') {
      CategoryPrefs.getOrderedCategories()
        .filter((c) => c.name && c.name !== 'all' && c.name !== 'saathi')
        .slice(0, 8)
        .forEach((cat) => {
          if (bar.querySelector(`[data-cat="${cat.name}"]`)) return;
          const btn = document.createElement('button');
          btn.className = 'akhbaar-cat-chip';
          btn.dataset.cat = cat.name;
          btn.dataset.catKind = cat.kind || 'user';
          btn.innerHTML = `<span class="akhbaar-cat-emoji" aria-hidden="true">${cat.emoji || '📌'}</span> ${cat.name}`;
          bar.insertBefore(btn, document.getElementById('akhbaarAddCat'));
        });
      CategoryPrefs.bindCategoryLongPress(bar);
    } else if (typeof myCategories !== 'undefined' && Array.isArray(myCategories)) {
      myCategories.slice(0, 5).forEach((cat) => {
        if (bar.querySelector(`[data-cat="${cat.name}"]`)) return;
        const btn = document.createElement('button');
        btn.className = 'akhbaar-cat-chip';
        btn.dataset.cat = cat.name;
        btn.innerHTML = `<span class="akhbaar-cat-emoji" aria-hidden="true">${cat.emoji || '📌'}</span> ${cat.name}`;
        bar.insertBefore(btn, document.getElementById('akhbaarAddCat'));
      });
    }
  } catch (e) {}

  bar.querySelectorAll('.akhbaar-cat-chip').forEach((chip) => {
    tintAkhbaarChip(chip);
    chip.addEventListener('click', () => {
      if (chip.dataset.cat === 'add') {
        if (typeof CategoryPrefs !== 'undefined' && CategoryPrefs.openCategoryManageSheet) {
          CategoryPrefs.openCategoryManageSheet();
        } else {
          openAkhbaarCatAdd();
        }
        return;
      }
      bar.querySelectorAll('.akhbaar-cat-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      akhbaarActiveCat = chip.dataset.cat;
      try {
        CategoryPrefs?.touchCategory?.(akhbaarActiveCat);
      } catch (e) {}
      if (akhbaarActiveCat === 'saathi') {
        if (typeof setAkhbaarMode === 'function') setAkhbaarMode('saathi');
        return;
      }
      if (typeof setAkhbaarMode === 'function' && typeof akhbaarMode === 'function' && akhbaarMode() !== 'all') {
        setAkhbaarMode('all');
      }
      filterReelByCategory(akhbaarActiveCat);
    });
  });

  // Horizontal edge rubber-band: past last chip → add category sheet
  let sx = 0;
  bar.addEventListener(
    'touchstart',
    (e) => {
      sx = e.touches[0].clientX;
    },
    { passive: true }
  );
  bar.addEventListener(
    'touchend',
    (e) => {
      const dx = (e.changedTouches[0]?.clientX || 0) - sx;
      if (dx < -64 && bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 8) {
        if (typeof CategoryPrefs !== 'undefined' && CategoryPrefs.openCategoryManageSheet) {
          CategoryPrefs.openCategoryManageSheet();
        } else {
          openAkhbaarCatAdd();
        }
      }
    },
    { passive: true }
  );
}

function ensureSaathiChip(bar) {
  if (!bar || bar.querySelector('[data-cat="saathi"]')) return;
  const all = bar.querySelector('[data-cat="all"]');
  const btn = document.createElement('button');
  btn.className = 'akhbaar-cat-chip';
  btn.dataset.cat = 'saathi';
  const label =
    typeof t === 'function' && t('akhbaar_saathi') !== 'akhbaar_saathi' ? t('akhbaar_saathi') : 'Saathi';
  btn.innerHTML = `<span data-icon="users" data-icon-size="14"></span> ${label}`;
  if (all?.nextSibling) bar.insertBefore(btn, all.nextSibling);
  else bar.insertBefore(btn, bar.firstChild?.nextSibling || null);
  if (typeof hydrateIcons === 'function') hydrateIcons(btn);
}

function filterReelByCategory(cat) {
  const stage = document.getElementById('reelStage');
  if (!stage) return;
  if (cat === 'saathi') return;
  stage.querySelectorAll('.reel-card').forEach((card) => {
    if (cat === 'all') {
      card.style.display = '';
    } else {
      const tag = card.querySelector('.q-tag');
      card.style.display = tag && tag.textContent.includes(cat) ? '' : 'none';
    }
  });
}

function openAkhbaarCatAdd() {
  const bar = document.getElementById('akhbaarCatBar');
  const title =
    typeof t === 'function' && t('akhbaar_add_cat_title') !== 'akhbaar_add_cat_title'
      ? t('akhbaar_add_cat_title')
      : 'Add a Category to Akhbaar';
  const sub =
    typeof t === 'function' && t('akhbaar_add_cat_sub') !== 'akhbaar_add_cat_sub'
      ? t('akhbaar_add_cat_sub')
      : 'AI will generate news & questions for it daily';

  const bodyHtml = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;">${sub}</div>
    <div class="cat-search-wrap" style="margin-bottom:14px;">
      <input class="cat-search-input" id="akhbaarCatInput" placeholder="Search or type a category…">
      <div class="cat-suggestions" id="akhbaarCatSuggestions"></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;" data-akhbaar-cat-picks>
      ${(typeof CATEGORY_SUGGESTIONS !== 'undefined' ? CATEGORY_SUGGESTIONS : [])
        .slice(0, 10)
        .map(
          (c) =>
            `<button type="button" class="akhbaar-cat-chip" data-name="${c.name}" data-emoji="${c.emoji}">${c.emoji} ${c.name}</button>`
        )
        .join('')}
    </div>`;

  function wirePicks(sheet, close) {
    sheet.querySelectorAll('[data-name]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const emoji = btn.dataset.emoji;
        if (typeof addCategory === 'function') addCategory(name, emoji);
        const newChip = document.createElement('button');
        newChip.className = 'akhbaar-cat-chip';
        newChip.dataset.cat = name;
        newChip.textContent = emoji + ' ' + name;
        bar?.insertBefore(newChip, document.getElementById('akhbaarAddCat'));
        newChip.addEventListener('click', () => {
          bar.querySelectorAll('.akhbaar-cat-chip').forEach((c) => c.classList.remove('active'));
          newChip.classList.add('active');
          akhbaarActiveCat = name;
          filterReelByCategory(name);
        });
        close();
        if (typeof showToast === 'function') showToast(`${emoji} ${name} added to Akhbaar!`);
      });
    });
  }

  if (typeof openHalfSheet === 'function') {
    openHalfSheet({
      id: 'akhbaarCatAddSheet',
      title,
      accent: 'akhbaar',
      bodyHtml,
      onMount: wirePicks,
    });
    return;
  }

  document.getElementById('akhbaarCatAddSheet')?.remove();
  const sheet = document.createElement('div');
  sheet.id = 'akhbaarCatAddSheet';
  sheet.className = 'archive-overlay';
  sheet.dataset.navManaged = '1';
  sheet.dataset.sheetPanel = '1';
  sheet.innerHTML = `
    <div class="archive-header">
      <button type="button" data-overlay-dismiss aria-label="Back">←</button>
      <div style="flex:1"><strong>${title}</strong></div>
    </div>
    <div style="padding:16px 18px 28px;">${bodyHtml}</div>`;
  document.querySelector('.device')?.appendChild(sheet);
  const close = () => {
    if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
    sheet.remove();
  };
  if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
  sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
  wirePicks(sheet, close);
}

window.initAkhbaarCatBar = initAkhbaarCatBar;
window.filterReelByCategory = filterReelByCategory;
window.openAkhbaarCatAdd = openAkhbaarCatAdd;
window.ensureSaathiChip = ensureSaathiChip;
