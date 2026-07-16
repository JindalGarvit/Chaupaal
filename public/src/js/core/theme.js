// ===================== DYNAMIC THEME =====================
// Time-of-day shell themes (class on <html> + .device).
// Keys: default | night | dawn | rain | hot | cold
const THEME_KEYS = ['night','dawn','rain','hot','cold'];

function applyTheme(themeKey){
  const key = THEME_KEYS.includes(themeKey) ? themeKey : 'default';
  const root = document.documentElement;
  const device = document.querySelector('.device');

  THEME_KEYS.forEach(k=>{
    root.classList.remove('theme-'+k);
    document.body?.classList.remove('theme-'+k);
    device?.classList.remove('theme-'+k);
  });

  if(key !== 'default'){
    root.classList.add('theme-'+key);
    document.body?.classList.add('theme-'+key);
    device?.classList.add('theme-'+key);
  }

  // Update browser chrome tint
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta){
    const colors = {night:'#0F1117',dawn:'#F5E6D3',rain:'#E8EEF2',hot:'#FFF0E8',cold:'#E8F2F5',default:'#E63946'};
    meta.setAttribute('content', colors[key] || colors.default);
  }

  try{
    // Only persist intentional overrides — let auto theme recompute each visit
    if(key === 'default') localStorage.removeItem('chaupaal_theme');
    else localStorage.setItem('chaupaal_theme', key);
  }catch(e){}
}

function initDynamicTheme(){
  let key = 'default';
  try{
    const saved = localStorage.getItem('chaupaal_theme');
    if(THEME_KEYS.includes(saved)) key = saved;
    else {
      const hour = new Date().getHours();
      // Match intended Chaupaal time-of-day shell:
      // night 21:00–04:59, dawn 05:00–07:59, else default (day)
      if(hour >= 21 || hour < 5) key = 'night';
      else if(hour >= 5 && hour < 8) key = 'dawn';
      else key = 'default';
    }
  }catch(e){}
  applyTheme(key);
}
