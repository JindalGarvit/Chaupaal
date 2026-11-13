/**
 * Akhbaar source registry (Global L6) — which publishers ground the news for a reader, keyed by the
 * reader's Region (getRegionPrefs().contentRegion), never by UI language. Unknown regions → International.
 *
 * Akhbaar has no feed scraper: the scheduled cron (api/refresh-category-cache.js, paused by default via
 * CATEGORY_CRON_PAUSED) asks the AI provider's web-search tool for recent articles. A source set here
 * becomes the search tool's `allowed_domains` + approximate `user_location`, so grounded items link to
 * these publishers only. We store a headline, a ≤80-word summary and the article link — never the article.
 *
 * Inclusion rule: public-service broadcasters, news agencies with public pages, and publishers that run
 * free public RSS / news pages. Each entry's terms still need a legal check before any commercial
 * syndication beyond headline + summary + link (see residuals in the L6 summary).
 *
 * UMD: window.AkhbaarSources in the browser, module.exports in Node (server-lib/cat-content.js).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AkhbaarSources = api;
  else if (root) root.AkhbaarSources = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** kind: broadcaster = public-service broadcaster · agency = news agency · publisher = paper / site with public RSS. */
  const REGIONS = {
    intl: {
 // i18n-ignore (LLM prompt name)
      lang: 'en',
      sources: [
        { name: 'Reuters', domain: 'reuters.com', kind: 'agency' },
        { name: 'AP News', domain: 'apnews.com', kind: 'agency' },
        { name: 'BBC News', domain: 'bbc.com', kind: 'broadcaster' },
        { name: 'Al Jazeera English', domain: 'aljazeera.com', kind: 'broadcaster' },
        { name: 'DW', domain: 'dw.com', kind: 'broadcaster' },
        { name: 'France 24', domain: 'france24.com', kind: 'broadcaster' },
        { name: 'NPR', domain: 'npr.org', kind: 'broadcaster' },
        { name: 'The Guardian', domain: 'theguardian.com', kind: 'publisher' },
      ],
    },
    us: {
 // i18n-ignore (LLM prompt name)
      lang: 'en',
      sources: [
        { name: 'AP News', domain: 'apnews.com', kind: 'agency' },
        { name: 'NPR', domain: 'npr.org', kind: 'broadcaster' },
        { name: 'PBS News', domain: 'pbs.org', kind: 'broadcaster' },
        { name: 'Reuters', domain: 'reuters.com', kind: 'agency' },
        { name: 'CBS News', domain: 'cbsnews.com', kind: 'publisher' },
        { name: 'ABC News', domain: 'abcnews.go.com', kind: 'publisher' },
      ],
    },
    uk: {
 // i18n-ignore (LLM prompt name)
      lang: 'en',
      sources: [
        { name: 'BBC News', domain: 'bbc.co.uk', kind: 'broadcaster' },
        { name: 'The Guardian', domain: 'theguardian.com', kind: 'publisher' },
        { name: 'Sky News', domain: 'news.sky.com', kind: 'publisher' },
        { name: 'ITV News', domain: 'itv.com', kind: 'broadcaster' },
        { name: 'Reuters', domain: 'reuters.com', kind: 'agency' },
      ],
    },
    in: {
 // i18n-ignore (LLM prompt name)
      lang: 'en',
      sources: [
        { name: 'The Hindu', domain: 'thehindu.com', kind: 'publisher' },
        { name: 'The Indian Express', domain: 'indianexpress.com', kind: 'publisher' },
        { name: 'NDTV', domain: 'ndtv.com', kind: 'publisher' },
        { name: 'All India Radio News', domain: 'newsonair.gov.in', kind: 'broadcaster' },
        { name: 'Press Information Bureau', domain: 'pib.gov.in', kind: 'agency' },
        { name: 'Hindustan Times', domain: 'hindustantimes.com', kind: 'publisher' },
      ],
    },
    pk: {
 // i18n-ignore (LLM prompt name)
      lang: 'en',
      sources: [
        { name: 'Dawn', domain: 'dawn.com', kind: 'publisher' },
        { name: 'The Express Tribune', domain: 'tribune.com.pk', kind: 'publisher' },
        { name: 'Geo News', domain: 'geo.tv', kind: 'publisher' },
        { name: 'Associated Press of Pakistan', domain: 'app.com.pk', kind: 'agency' },
        { name: 'Radio Pakistan', domain: 'radio.gov.pk', kind: 'broadcaster' },
      ],
    },
    bd: {
 // i18n-ignore (LLM prompt name)
      lang: 'en',
      sources: [
        { name: 'The Daily Star', domain: 'thedailystar.net', kind: 'publisher' },
        { name: 'Prothom Alo', domain: 'prothomalo.com', kind: 'publisher' },
        { name: 'BSS', domain: 'bssnews.net', kind: 'agency' },
        { name: 'bdnews24.com', domain: 'bdnews24.com', kind: 'publisher' },
        { name: 'Dhaka Tribune', domain: 'dhakatribune.com', kind: 'publisher' },
      ],
    },
    arab: {
 // i18n-ignore (LLM prompt name)
      lang: 'ar',
      sources: [
        { name: 'Al Jazeera', domain: 'aljazeera.net', kind: 'broadcaster' },
        { name: 'Al Jazeera English', domain: 'aljazeera.com', kind: 'broadcaster' },
        { name: 'Gulf News', domain: 'gulfnews.com', kind: 'publisher' },
        { name: 'The National', domain: 'thenationalnews.com', kind: 'publisher' },
        { name: 'Arab News', domain: 'arabnews.com', kind: 'publisher' },
        { name: 'WAM', domain: 'wam.ae', kind: 'agency' },
        { name: 'Asharq Al-Awsat', domain: 'aawsat.com', kind: 'publisher' },
      ],
    },
    es_latam: {
 // i18n-ignore (LLM prompt name)
      lang: 'es',
      sources: [
        { name: 'EFE', domain: 'efe.com', kind: 'agency' },
        { name: 'RTVE', domain: 'rtve.es', kind: 'broadcaster' },
        { name: 'El País', domain: 'elpais.com', kind: 'publisher' },
        { name: 'BBC News Mundo', domain: 'bbc.com', kind: 'broadcaster' },
        { name: 'DW Español', domain: 'dw.com', kind: 'broadcaster' },
        { name: 'Infobae', domain: 'infobae.com', kind: 'publisher' },
      ],
    },
    fr: {
 // i18n-ignore (LLM prompt name)
      lang: 'fr',
      sources: [
        { name: 'franceinfo', domain: 'francetvinfo.fr', kind: 'broadcaster' },
        { name: 'RFI', domain: 'rfi.fr', kind: 'broadcaster' },
        { name: 'France 24', domain: 'france24.com', kind: 'broadcaster' },
        { name: 'Le Monde', domain: 'lemonde.fr', kind: 'publisher' },
        { name: 'AFP', domain: 'afp.com', kind: 'agency' },
      ],
    },
    br_pt: {
 // i18n-ignore (LLM prompt name)
      lang: 'pt',
      sources: [
        { name: 'Agência Brasil', domain: 'agenciabrasil.ebc.com.br', kind: 'agency' },
        { name: 'g1', domain: 'g1.globo.com', kind: 'publisher' },
        { name: 'Folha de S.Paulo', domain: 'folha.uol.com.br', kind: 'publisher' },
        { name: 'RTP Notícias', domain: 'rtp.pt', kind: 'broadcaster' },
        { name: 'Público', domain: 'publico.pt', kind: 'publisher' },
        { name: 'Lusa', domain: 'lusa.pt', kind: 'agency' },
      ],
    },
    de: {
 // i18n-ignore (LLM prompt name)
      lang: 'de',
      sources: [
        { name: 'tagesschau', domain: 'tagesschau.de', kind: 'broadcaster' },
        { name: 'DW', domain: 'dw.com', kind: 'broadcaster' },
        { name: 'ZDFheute', domain: 'zdf.de', kind: 'broadcaster' },
        { name: 'Der Spiegel', domain: 'spiegel.de', kind: 'publisher' },
        { name: 'Deutschlandfunk', domain: 'deutschlandfunk.de', kind: 'broadcaster' },
      ],
    },
    id: {
 // i18n-ignore (LLM prompt name)
      lang: 'id',
      sources: [
        { name: 'ANTARA', domain: 'antaranews.com', kind: 'agency' },
        { name: 'Kompas', domain: 'kompas.com', kind: 'publisher' },
        { name: 'Tempo', domain: 'tempo.co', kind: 'publisher' },
        { name: 'detikcom', domain: 'detik.com', kind: 'publisher' },
        { name: 'RRI', domain: 'rri.co.id', kind: 'broadcaster' },
      ],
    },
    jp: {
 // i18n-ignore (LLM prompt name)
      lang: 'ja',
      sources: [
        { name: 'NHK', domain: 'nhk.or.jp', kind: 'broadcaster' },
        { name: 'Kyodo News', domain: 'kyodonews.net', kind: 'agency' },
        { name: 'The Japan Times', domain: 'japantimes.co.jp', kind: 'publisher' },
        { name: 'Asahi Shimbun', domain: 'asahi.com', kind: 'publisher' },
      ],
    },
    kr: {
 // i18n-ignore (LLM prompt name)
      lang: 'ko',
      sources: [
        { name: 'Yonhap', domain: 'yna.co.kr', kind: 'agency' },
        { name: 'KBS', domain: 'kbs.co.kr', kind: 'broadcaster' },
        { name: 'The Korea Herald', domain: 'koreaherald.com', kind: 'publisher' },
        { name: 'Korea JoongAng Daily', domain: 'koreajoongangdaily.joins.com', kind: 'publisher' },
      ],
    },
    zh_intl: {
 // i18n-ignore (LLM prompt name)
      lang: 'zh',
      sources: [
        { name: 'BBC News 中文', domain: 'bbc.com', kind: 'broadcaster' },
        { name: 'DW 中文', domain: 'dw.com', kind: 'broadcaster' },
        { name: 'RFI 华语', domain: 'rfi.fr', kind: 'broadcaster' },
        { name: 'RTHK', domain: 'rthk.hk', kind: 'broadcaster' },
        { name: 'Lianhe Zaobao', domain: 'zaobao.com.sg', kind: 'publisher' },
        { name: 'Central News Agency', domain: 'cna.com.tw', kind: 'agency' },
      ],
    },
  };

  const COUNTRY_REGION = {};
  const assign = (region, list) => list.split(' ').forEach((c) => (COUNTRY_REGION[c] = region));
  assign('us', 'US PR GU VI AS MP UM');
  assign('uk', 'GB IM JE GG');
  assign('in', 'IN');
  assign('pk', 'PK');
  assign('bd', 'BD');
  assign('arab', 'AE SA QA KW BH OM YE IQ JO LB SY PS EG LY TN DZ MA SD MR');
  assign('es_latam', 'ES MX GT SV HN NI CR PA CU DO CO VE PE EC BO CL AR UY PY');
  assign('fr', 'FR MC');
  assign('br_pt', 'BR PT AO MZ CV');
  assign('de', 'DE AT CH LI');
  assign('id', 'ID');
  assign('jp', 'JP');
  assign('kr', 'KR');
  assign('zh_intl', 'CN TW HK MO');

  /** Source region for a country / contentRegion ('in', 'US' …); unknown → 'intl'. */
  function regionFor(countryOrContentRegion) {
    return COUNTRY_REGION[String(countryOrContentRegion || '').trim().toUpperCase()] || 'intl';
  }

  function valid(id) {
    return Object.prototype.hasOwnProperty.call(REGIONS, id) ? id : null;
  }

  /**
   * Regions a reader gets: their own (from Region) + any they added (users/{uid}.akhbaarRegions), deduped,
   * own first. International is always included last so global stories never disappear.
   */
  function regionsFor(country, extra) {
    const out = [regionFor(country)];
    (Array.isArray(extra) ? extra : []).forEach((r) => {
      const id = valid(String(r || '').toLowerCase());
      if (id && out.indexOf(id) < 0) out.push(id);
    });
    if (out.indexOf('intl') < 0) out.push('intl');
    return out;
  }

  function sourcesFor(regionId) {
    return (REGIONS[valid(regionId) || 'intl']).sources.slice();
  }

  /** Unique domains for the web-search tool's allowed_domains (≤ 12). */
  function domainsFor(regionId) {
    return Array.from(new Set(sourcesFor(regionId).map((s) => s.domain))).slice(0, 12);
  }

  /** Representative ISO country for the search tool's approximate location (null for intl). */
  function searchCountry(regionId) {
    const id = valid(regionId) || 'intl';
    if (id === 'intl') return null;
    return { us: 'US', uk: 'GB', in: 'IN', pk: 'PK', bd: 'BD', arab: 'AE', es_latam: 'ES', fr: 'FR', br_pt: 'BR', de: 'DE', id: 'ID', jp: 'JP', kr: 'KR', zh_intl: null }[id] || null;
  }

  return { REGIONS, COUNTRY_REGION, regionFor, regionsFor, sourcesFor, domainsFor, searchCountry, ids: () => Object.keys(REGIONS) };
});
