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

function openAddCategoryFlow() {
  const fn = window.CategoryPrefs?.openAddCategorySheet || window.CategoryPrefs?.openCategoryManageSheet;
  if (typeof fn === 'function') {
    fn();
    return true;
  }
  return false;
}

function refreshAkhbaarCatBar() {
  const bar = document.getElementById('akhbaarCatBar');
  if (!bar) return;
  bar.querySelectorAll('.akhbaar-cat-chip[data-cat-kind]').forEach((el) => el.remove());
  bar.querySelectorAll('.akhbaar-cat-chip').forEach((chip) => chip.replaceWith(chip.cloneNode(true)));
  delete bar.dataset.wired;
  initAkhbaarCatBar();
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
          const WARN_DAYS = 10;
          if (cat.kind === 'suggested') {
            const daysSince = (Date.now() - (Number(cat.lastUsedAt) || Date.now())) / 86400000;
            if (daysSince >= WARN_DAYS) btn.style.opacity = String(Math.max(0.4, 1 - (daysSince - WARN_DAYS) / 4));
          }
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
        openAddCategoryFlow();
        return;
      }
      bar.querySelectorAll('.akhbaar-cat-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      akhbaarActiveCat = chip.dataset.cat;
      CategoryPrefs?.touchCategory?.(akhbaarActiveCat);
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
        openAddCategoryFlow();
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
  if (openAddCategoryFlow()) return;
  openHalfSheet?.({
    id: 'akhbaarCatAddSheet',
    title: 'Add category',
    accent: 'akhbaar',
    bodyHtml: `<p style="color:var(--muted);font-size:13px;">Loading categories…</p>`,
  });
}

window.refreshAkhbaarCatBar = refreshAkhbaarCatBar;
window.initAkhbaarCatBar = initAkhbaarCatBar;
window.filterReelByCategory = filterReelByCategory;
window.openAkhbaarCatAdd = openAkhbaarCatAdd;
window.ensureSaathiChip = ensureSaathiChip;
