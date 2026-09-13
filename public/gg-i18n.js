(() => {
  const dictionaries = {
    en: {
      'Karibu Golden Ghost': 'Welcome to Golden Ghost',
      'Ingia': 'Login',
      'Jisajili': 'Sign up',
      'Dashibodi': 'Dashboard',
      'Jumuiya': 'Community',
      'Ujumbe': 'Messages',
      'Mipangilio': 'Settings',
      'Arifa': 'Notifications',
      'Wasifu': 'Profile',
      'Gundua': 'Discover',
      'Usalama': 'Security',
      'Malipo': 'Payments',
      'Taarifa': 'Reports',
      'Wanachama': 'Members',
      'Toka': 'Logout',
      'Endelea': 'Continue',
      'Hifadhi': 'Save',
      'Ghairi': 'Cancel',
      'Tafuta': 'Search',
      'Jina kamili': 'Full name',
      'Jina la mtumiaji': 'Username',
      'Barua pepe': 'Email',
      'Nenosiri': 'Password',
      'Thibitisha barua pepe': 'Verify email',
      'Umesahau nenosiri?': 'Forgot password?',
      'Free': 'Free',
      'Plus': 'Plus',
      'Premium': 'Premium',
      'Anza sasa': 'Get started',
      'Jiunge sasa': 'Join now',
      'One Community. One World.': 'One Community. One World.',
      'Hakuna data bado': 'No data yet',
      'Hujatoa taarifa bado.': 'No information yet.'
    },
    sw: {
      'Welcome to Golden Ghost': 'Karibu Golden Ghost',
      'Login': 'Ingia',
      'Sign up': 'Jisajili',
      'Dashboard': 'Dashibodi',
      'Community': 'Jumuiya',
      'Messages': 'Ujumbe',
      'Settings': 'Mipangilio',
      'Notifications': 'Arifa',
      'Profile': 'Wasifu',
      'Discover': 'Gundua',
      'Security': 'Usalama',
      'Payments': 'Malipo',
      'Reports': 'Taarifa',
      'Members': 'Wanachama',
      'Logout': 'Toka',
      'Continue': 'Endelea',
      'Save': 'Hifadhi',
      'Cancel': 'Ghairi',
      'Search': 'Tafuta',
      'Full name': 'Jina kamili',
      'Username': 'Jina la mtumiaji',
      'Email': 'Barua pepe',
      'Password': 'Nenosiri',
      'Verify email': 'Thibitisha barua pepe',
      'Forgot password?': 'Umesahau nenosiri?',
      'Get started': 'Anza sasa',
      'Join now': 'Jiunge sasa',
      'No data yet': 'Hakuna data bado',
      'No information yet.': 'Hujatoa taarifa bado.'
    }
  };
  const key = 'gg_language';
  const supported = Object.keys(dictionaries);
  const saved = localStorage.getItem(key);
  const browser = (navigator.language || 'sw').toLowerCase().startsWith('sw') ? 'sw' : 'en';
  let lang = supported.includes(saved) ? saved : browser;

  function translateValue(value, dict) {
    const exact = dict[value.trim()];
    return exact !== undefined ? exact : value;
  }

  function walk(node, dict) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 120) return;
      const translated = translateValue(trimmed, dict);
      if (translated !== trimmed) node.nodeValue = text.replace(trimmed, translated);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA'].includes(tag)) return;
    ['placeholder','title','aria-label'].forEach(attr => {
      const value = node.getAttribute(attr);
      if (!value) return;
      const t = translateValue(value, dict);
      if (t !== value) node.setAttribute(attr, t);
    });
    node.childNodes.forEach(child => walk(child, dict));
  }

  function setLanguage(next) {
    lang = supported.includes(next) ? next : 'sw';
    localStorage.setItem(key, lang);
    document.documentElement.lang = lang;
    walk(document.body, dictionaries[lang]);
    const selector = document.getElementById('gg-language-selector');
    if (selector) selector.value = lang;
    document.dispatchEvent(new CustomEvent('gg:language', { detail: { lang } }));
  }

  function mountSelector() {
    if (!document.body || document.getElementById('gg-language-selector-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'gg-language-selector-wrap';
    wrap.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483646;display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid rgba(255,210,31,.35);background:rgba(8,8,8,.88);backdrop-filter:blur(12px);border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:600 12px/1 Arial,sans-serif';
    const label = document.createElement('span'); label.textContent = '🌐';
    const select = document.createElement('select'); select.id = 'gg-language-selector';
    select.setAttribute('aria-label', 'Language');
    select.style.cssText = 'background:transparent;color:#ffd21f;border:0;outline:0;font-weight:700;cursor:pointer';
    [['sw','Kiswahili'],['en','English']].forEach(([value,text]) => { const o=document.createElement('option');o.value=value;o.textContent=text;o.style.background='#111';o.style.color='#fff';select.appendChild(o); });
    select.value = lang;
    select.addEventListener('change', e => setLanguage(e.target.value));
    wrap.append(label, select);
    document.body.appendChild(wrap);
  }

  function boot() {
    mountSelector();
    setLanguage(lang);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
