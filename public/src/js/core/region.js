/**
 * Region (Global L0) — the user's country, detected on first run from the device and changeable in
 * Settings → Region. No IP lookups: navigator.languages region subtags + the device time zone.
 *
 * getRegionPrefs() is the one place later prompts read region defaults from: currency, phone
 * calling code, time zone, first day of week, 12/24 h, measurement system, and the content
 * region/area used for regional packs and sources (L6). Surfaces don't consume it yet.
 *
 * Storage: guests → localStorage `chaupaal_region` { country, source }; signed in → users/{uid}.region
 * (same shape). source 'user' (picked in Settings) always beats 'auto' (detected).
 */
(function () {
  'use strict';

  /** ISO 3166-1 alpha-2 | English name | ISO 4217 currency | calling code. */
  const COUNTRY_DATA =
    'AD|Andorra|EUR|376;AE|United Arab Emirates|AED|971;AF|Afghanistan|AFN|93;AG|Antigua and Barbuda|XCD|1268;' +
    'AI|Anguilla|XCD|1264;AL|Albania|ALL|355;AM|Armenia|AMD|374;AO|Angola|AOA|244;AR|Argentina|ARS|54;' +
    'AS|American Samoa|USD|1684;AT|Austria|EUR|43;AU|Australia|AUD|61;AW|Aruba|AWG|297;AX|Åland Islands|EUR|358;' +
    'AZ|Azerbaijan|AZN|994;BA|Bosnia and Herzegovina|BAM|387;BB|Barbados|BBD|1246;BD|Bangladesh|BDT|880;' +
    'BE|Belgium|EUR|32;BF|Burkina Faso|XOF|226;BG|Bulgaria|EUR|359;BH|Bahrain|BHD|973;BI|Burundi|BIF|257;' +
    'BJ|Benin|XOF|229;BL|Saint Barthélemy|EUR|590;BM|Bermuda|BMD|1441;BN|Brunei|BND|673;BO|Bolivia|BOB|591;' +
    'BQ|Caribbean Netherlands|USD|599;BR|Brazil|BRL|55;BS|Bahamas|BSD|1242;BT|Bhutan|BTN|975;BW|Botswana|BWP|267;' +
    'BY|Belarus|BYN|375;BZ|Belize|BZD|501;CA|Canada|CAD|1;CD|Congo (DRC)|CDF|243;CF|Central African Republic|XAF|236;' +
    'CG|Congo|XAF|242;CH|Switzerland|CHF|41;CI|Côte d’Ivoire|XOF|225;CK|Cook Islands|NZD|682;CL|Chile|CLP|56;' +
    'CM|Cameroon|XAF|237;CN|China|CNY|86;CO|Colombia|COP|57;CR|Costa Rica|CRC|506;CU|Cuba|CUP|53;' +
    'CV|Cape Verde|CVE|238;CW|Curaçao|XCG|599;CY|Cyprus|EUR|357;CZ|Czechia|CZK|420;DE|Germany|EUR|49;' +
    'DJ|Djibouti|DJF|253;DK|Denmark|DKK|45;DM|Dominica|XCD|1767;DO|Dominican Republic|DOP|1809;DZ|Algeria|DZD|213;' +
    'EC|Ecuador|USD|593;EE|Estonia|EUR|372;EG|Egypt|EGP|20;EH|Western Sahara|MAD|212;ER|Eritrea|ERN|291;' +
    'ES|Spain|EUR|34;ET|Ethiopia|ETB|251;FI|Finland|EUR|358;FJ|Fiji|FJD|679;FK|Falkland Islands|FKP|500;' +
    'FM|Micronesia|USD|691;FO|Faroe Islands|DKK|298;FR|France|EUR|33;GA|Gabon|XAF|241;GB|United Kingdom|GBP|44;' +
    'GD|Grenada|XCD|1473;GE|Georgia|GEL|995;GF|French Guiana|EUR|594;GG|Guernsey|GBP|44;GH|Ghana|GHS|233;' +
    'GI|Gibraltar|GIP|350;GL|Greenland|DKK|299;GM|Gambia|GMD|220;GN|Guinea|GNF|224;GP|Guadeloupe|EUR|590;' +
    'GQ|Equatorial Guinea|XAF|240;GR|Greece|EUR|30;GT|Guatemala|GTQ|502;GU|Guam|USD|1671;GW|Guinea-Bissau|XOF|245;' +
    'GY|Guyana|GYD|592;HK|Hong Kong|HKD|852;HN|Honduras|HNL|504;HR|Croatia|EUR|385;HT|Haiti|HTG|509;' +
    'HU|Hungary|HUF|36;ID|Indonesia|IDR|62;IE|Ireland|EUR|353;IL|Israel|ILS|972;IM|Isle of Man|GBP|44;' +
    'IN|India|INR|91;IQ|Iraq|IQD|964;IR|Iran|IRR|98;IS|Iceland|ISK|354;IT|Italy|EUR|39;JE|Jersey|GBP|44;' +
    'JM|Jamaica|JMD|1876;JO|Jordan|JOD|962;JP|Japan|JPY|81;KE|Kenya|KES|254;KG|Kyrgyzstan|KGS|996;' +
    'KH|Cambodia|KHR|855;KI|Kiribati|AUD|686;KM|Comoros|KMF|269;KN|Saint Kitts and Nevis|XCD|1869;' +
    'KP|North Korea|KPW|850;KR|South Korea|KRW|82;KW|Kuwait|KWD|965;KY|Cayman Islands|KYD|1345;' +
    'KZ|Kazakhstan|KZT|7;LA|Laos|LAK|856;LB|Lebanon|LBP|961;LC|Saint Lucia|XCD|1758;LI|Liechtenstein|CHF|423;' +
    'LK|Sri Lanka|LKR|94;LR|Liberia|LRD|231;LS|Lesotho|LSL|266;LT|Lithuania|EUR|370;LU|Luxembourg|EUR|352;' +
    'LV|Latvia|EUR|371;LY|Libya|LYD|218;MA|Morocco|MAD|212;MC|Monaco|EUR|377;MD|Moldova|MDL|373;' +
    'ME|Montenegro|EUR|382;MF|Saint Martin|EUR|590;MG|Madagascar|MGA|261;MH|Marshall Islands|USD|692;' +
    'MK|North Macedonia|MKD|389;ML|Mali|XOF|223;MM|Myanmar|MMK|95;MN|Mongolia|MNT|976;MO|Macao|MOP|853;' +
    'MP|Northern Mariana Islands|USD|1670;MQ|Martinique|EUR|596;MR|Mauritania|MRU|222;MS|Montserrat|XCD|1664;' +
    'MT|Malta|EUR|356;MU|Mauritius|MUR|230;MV|Maldives|MVR|960;MW|Malawi|MWK|265;MX|Mexico|MXN|52;' +
    'MY|Malaysia|MYR|60;MZ|Mozambique|MZN|258;NA|Namibia|NAD|264;NC|New Caledonia|XPF|687;NE|Niger|XOF|227;' +
    'NF|Norfolk Island|AUD|672;NG|Nigeria|NGN|234;NI|Nicaragua|NIO|505;NL|Netherlands|EUR|31;NO|Norway|NOK|47;' +
    'NP|Nepal|NPR|977;NR|Nauru|AUD|674;NU|Niue|NZD|683;NZ|New Zealand|NZD|64;OM|Oman|OMR|968;PA|Panama|PAB|507;' +
    'PE|Peru|PEN|51;PF|French Polynesia|XPF|689;PG|Papua New Guinea|PGK|675;PH|Philippines|PHP|63;' +
    'PK|Pakistan|PKR|92;PL|Poland|PLN|48;PM|Saint Pierre and Miquelon|EUR|508;PR|Puerto Rico|USD|1787;' +
    'PS|Palestine|ILS|970;PT|Portugal|EUR|351;PW|Palau|USD|680;PY|Paraguay|PYG|595;QA|Qatar|QAR|974;' +
    'RE|Réunion|EUR|262;RO|Romania|RON|40;RS|Serbia|RSD|381;RU|Russia|RUB|7;RW|Rwanda|RWF|250;' +
    'SA|Saudi Arabia|SAR|966;SB|Solomon Islands|SBD|677;SC|Seychelles|SCR|248;SD|Sudan|SDG|249;SE|Sweden|SEK|46;' +
    'SG|Singapore|SGD|65;SH|Saint Helena|SHP|290;SI|Slovenia|EUR|386;SK|Slovakia|EUR|421;SL|Sierra Leone|SLE|232;' +
    'SM|San Marino|EUR|378;SN|Senegal|XOF|221;SO|Somalia|SOS|252;SR|Suriname|SRD|597;SS|South Sudan|SSP|211;' +
    'ST|São Tomé and Príncipe|STN|239;SV|El Salvador|USD|503;SX|Sint Maarten|XCG|1721;SY|Syria|SYP|963;' +
    'SZ|Eswatini|SZL|268;TC|Turks and Caicos Islands|USD|1649;TD|Chad|XAF|235;TG|Togo|XOF|228;TH|Thailand|THB|66;' +
    'TJ|Tajikistan|TJS|992;TK|Tokelau|NZD|690;TL|Timor-Leste|USD|670;TM|Turkmenistan|TMT|993;TN|Tunisia|TND|216;' +
    'TO|Tonga|TOP|676;TR|Türkiye|TRY|90;TT|Trinidad and Tobago|TTD|1868;TV|Tuvalu|AUD|688;TW|Taiwan|TWD|886;' +
    'TZ|Tanzania|TZS|255;UA|Ukraine|UAH|380;UG|Uganda|UGX|256;US|United States|USD|1;UY|Uruguay|UYU|598;' +
    'UZ|Uzbekistan|UZS|998;VA|Vatican City|EUR|39;VC|Saint Vincent and the Grenadines|XCD|1784;VE|Venezuela|VES|58;' +
    'VG|British Virgin Islands|USD|1284;VI|U.S. Virgin Islands|USD|1340;VN|Vietnam|VND|84;VU|Vanuatu|VUV|678;' +
    'WF|Wallis and Futuna|XPF|681;WS|Samoa|WST|685;XK|Kosovo|EUR|383;YE|Yemen|YER|967;YT|Mayotte|EUR|262;' +
    'ZA|South Africa|ZAR|27;ZM|Zambia|ZMW|260;ZW|Zimbabwe|ZWG|263;CC|Cocos (Keeling) Islands|AUD|61;' +
    'CX|Christmas Island|AUD|61;IO|British Indian Ocean Territory|USD|246;PN|Pitcairn Islands|NZD|64;' +
    'SJ|Svalbard and Jan Mayen|NOK|47;UM|U.S. Outlying Islands|USD|1';

  const COUNTRIES = {};
  COUNTRY_DATA.split(';').forEach((row) => {
    const [code, name, currency, dial] = row.split('|');
    COUNTRIES[code] = { code, name, currency, callingCode: '+' + dial };
  });

  /** Device time zone → country (IANA). Generic zones (UTC, Etc/*) are deliberately absent. */
  const TZ_COUNTRY = {
    'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK',
    'Asia/Kathmandu': 'NP', 'Asia/Katmandu': 'NP', 'Asia/Thimphu': 'BT', 'Indian/Maldives': 'MV', 'Asia/Kabul': 'AF',
    'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH',
    'Asia/Muscat': 'OM', 'Asia/Aden': 'YE', 'Asia/Baghdad': 'IQ', 'Asia/Tehran': 'IR', 'Asia/Amman': 'JO',
    'Asia/Beirut': 'LB', 'Asia/Damascus': 'SY', 'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Asia/Gaza': 'PS',
    'Asia/Hebron': 'PS', 'Africa/Cairo': 'EG', 'Africa/Tripoli': 'LY', 'Africa/Tunis': 'TN', 'Africa/Algiers': 'DZ',
    'Africa/Casablanca': 'MA', 'Africa/Khartoum': 'SD', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH',
    'Africa/Nairobi': 'KE', 'Africa/Addis_Ababa': 'ET', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG',
    'Africa/Johannesburg': 'ZA', 'Africa/Harare': 'ZW', 'Africa/Lusaka': 'ZM', 'Africa/Maputo': 'MZ',
    'Africa/Kinshasa': 'CD', 'Africa/Luanda': 'AO', 'Africa/Dakar': 'SN', 'Africa/Abidjan': 'CI', 'Africa/Douala': 'CM',
    'Africa/Kigali': 'RW', 'Africa/Windhoek': 'NA', 'Africa/Gaborone': 'BW', 'Indian/Mauritius': 'MU',
    'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'MO',
    'Asia/Taipei': 'TW', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Pyongyang': 'KP', 'Asia/Ulaanbaatar': 'MN',
    'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID',
    'Asia/Jayapura': 'ID', 'Asia/Pontianak': 'ID', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
    'Asia/Manila': 'PH', 'Asia/Phnom_Penh': 'KH', 'Asia/Vientiane': 'LA', 'Asia/Yangon': 'MM', 'Asia/Rangoon': 'MM',
    'Asia/Brunei': 'BN', 'Asia/Dili': 'TL', 'Asia/Almaty': 'KZ', 'Asia/Tashkent': 'UZ', 'Asia/Bishkek': 'KG',
    'Asia/Dushanbe': 'TJ', 'Asia/Ashgabat': 'TM', 'Asia/Baku': 'AZ', 'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM',
    'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES',
    'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Amsterdam': 'NL', 'Europe/Luxembourg': 'LU',
    'Europe/Berlin': 'DE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Rome': 'IT', 'Europe/Malta': 'MT',
    'Europe/Copenhagen': 'DK', 'Europe/Oslo': 'NO', 'Europe/Stockholm': 'SE', 'Europe/Helsinki': 'FI',
    'Atlantic/Reykjavik': 'IS', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK',
    'Europe/Budapest': 'HU', 'Europe/Ljubljana': 'SI', 'Europe/Zagreb': 'HR', 'Europe/Belgrade': 'RS',
    'Europe/Sarajevo': 'BA', 'Europe/Skopje': 'MK', 'Europe/Tirane': 'AL', 'Europe/Athens': 'GR', 'Europe/Sofia': 'BG',
    'Europe/Bucharest': 'RO', 'Europe/Chisinau': 'MD', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Minsk': 'BY',
    'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE', 'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR',
    'Asia/Istanbul': 'TR', 'Asia/Nicosia': 'CY', 'Europe/Monaco': 'MC',
    'America/New_York': 'US', 'America/Detroit': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Phoenix': 'US', 'America/Los_Angeles': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
    'America/Indiana/Indianapolis': 'US', 'America/Boise': 'US', 'America/Puerto_Rico': 'PR',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA',
    'America/Halifax': 'CA', 'America/St_Johns': 'CA', 'America/Regina': 'CA', 'America/Montreal': 'CA',
    'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Tijuana': 'MX', 'America/Cancun': 'MX',
    'America/Guatemala': 'GT', 'America/El_Salvador': 'SV', 'America/Tegucigalpa': 'HN', 'America/Managua': 'NI',
    'America/Costa_Rica': 'CR', 'America/Panama': 'PA', 'America/Havana': 'CU', 'America/Jamaica': 'JM',
    'America/Santo_Domingo': 'DO', 'America/Port-au-Prince': 'HT', 'America/Port_of_Spain': 'TT',
    'America/Bogota': 'CO', 'America/Caracas': 'VE', 'America/Lima': 'PE', 'America/Guayaquil': 'EC',
    'America/La_Paz': 'BO', 'America/Santiago': 'CL', 'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR',
    'America/Montevideo': 'UY', 'America/Asuncion': 'PY', 'America/Sao_Paulo': 'BR', 'America/Manaus': 'BR',
    'America/Fortaleza': 'BR', 'America/Recife': 'BR', 'America/Bahia': 'BR', 'America/Belem': 'BR',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU',
    'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU', 'Australia/Darwin': 'AU', 'Pacific/Auckland': 'NZ',
    'Pacific/Fiji': 'FJ', 'Pacific/Port_Moresby': 'PG', 'Pacific/Guam': 'GU', 'Pacific/Apia': 'WS', 'Pacific/Tongatapu': 'TO',
  };

  /** Macro area for content packs/sources (L6). */
  const AREAS = {
    south_asia: 'IN PK BD LK NP BT MV AF',
    mena: 'AE SA QA KW BH OM YE IQ IR JO LB SY PS IL EG LY TN DZ MA EH SD MR',
    east_asia: 'CN JP KR KP TW HK MO MN',
    southeast_asia: 'ID MY SG TH VN PH KH LA MM BN TL',
    central_asia: 'KZ KG TJ TM UZ AZ GE AM',
    north_america: 'US CA PR GU VI AS MP BM GL PM',
    latam:
      'MX GT SV HN NI CR PA CU JM DO HT TT BS BB BZ AG DM GD KN LC VC AI AW CW SX BQ BL MF GP MQ GF KY TC VG MS ' +
      'CO VE PE EC BO CL AR UY PY BR GY SR FK',
    oceania: 'AU NZ PG FJ WS TO VU SB KI TV NR PW FM MH NC PF WF CK NU TK NF',
    europe:
      'GB IE PT ES FR BE NL LU DE CH AT IT MT DK NO SE FI IS PL CZ SK HU SI HR RS BA ME MK AL XK GR BG RO MD UA BY ' +
      'LT LV EE RU TR CY MC AD SM VA LI GI GG JE IM FO AX',
    africa:
      'NG GH KE ET TZ UG ZA ZW ZM MZ CD CG AO SN CI CM RW NA BW MU LS SZ MW MG BI DJ ER SO SS CF TD NE ML BF BJ TG ' +
      'GN GW GM SL LR CV ST GQ GA KM SC RE YT SH',
  };
  const AREA_OF = {};
  Object.entries(AREAS).forEach(([area, list]) => list.split(' ').forEach((c) => (AREA_OF[c] = area)));

  const IMPERIAL = new Set(['US', 'LR', 'MM']);
  /** CLDR fallback when Intl.Locale week/hour data is unavailable. 0 = Sunday … 6 = Saturday. */
  const SUNDAY_START = new Set(
    'AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW'.split(' ')
  );
  const SATURDAY_START = new Set('AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' '));
  const HOUR12 = new Set(
    'US CA AU NZ IN PK BD NP LK PH MY EG SA AE QA KW BH OM JO IQ SY LB LY SD YE KR TW HK MO CO VE SV HN NI GT DO PR CR PA PE MX GH KE NG ET SO DZ TN BN'.split(' ')
  );

  const LS = 'chaupaal_region';

  function validCountry(code) {
    const c = String(code || '').trim().toUpperCase();
    return COUNTRIES[c] ? c : null;
  }

  function deviceTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
      return '';
    }
  }

  function deviceLanguages() {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : {};
      return (nav.languages && nav.languages.length ? Array.from(nav.languages) : [nav.language]).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  /**
   * Country from device signals. The time zone is where the phone actually is, so it wins over a
   * language tag (an "en-US" phone in Asia/Kolkata is in India); a language region subtag is used
   * when the zone is generic/unknown; then the UI language's home region; then US.
   */
  function detectRegion(signals) {
    const s = signals || {};
    const tz = s.timeZone != null ? s.timeZone : deviceTimeZone();
    const langs = s.languages || deviceLanguages();
    const byTz = validCountry(TZ_COUNTRY[tz]);
    if (byTz) return { country: byTz, via: 'timezone' };
    for (const tag of langs) {
      const parts = String(tag).replace(/_/g, '-').split('-').slice(1);
      const sub = parts.find((p) => /^[A-Za-z]{2}$/.test(p));
      const c = validCountry(sub);
      if (c) return { country: c, via: 'language' };
    }
    const lang = s.uiLang || (typeof currentLang !== 'undefined' ? currentLang : langs[0]);
    const home = typeof getLangEntry === 'function' ? validCountry(getLangEntry(lang).region) : null;
    if (home && String(lang || '').trim()) return { country: home, via: 'language_default' };
    return { country: 'US', via: 'default' };
  }

  function readStored() {
    try {
      const o = JSON.parse(localStorage.getItem(LS) || 'null');
      if (o && validCountry(o.country)) return { country: validCountry(o.country), source: o.source === 'user' ? 'user' : 'auto' };
    } catch (e) {}
    return null;
  }

  function writeStored(rec) {
    try {
      localStorage.setItem(LS, JSON.stringify(rec));
    } catch (e) {}
  }

  /** { country, source } — detects and stores on first call. */
  function getRegion() {
    const stored = readStored();
    if (stored) return stored;
    const rec = { country: detectRegion().country, source: 'auto' };
    writeStored(rec);
    return rec;
  }

  function profileWrite(fields) {
    try {
      if (typeof db !== 'undefined' && db && typeof currentUser !== 'undefined' && currentUser) {
        return db.collection('users').doc(currentUser.uid).set(fields, { merge: true }).catch(() => {});
      }
    } catch (e) {}
    return null;
  }

  function setRegion(code, opts) {
    const o = opts || {};
    const country = validCountry(code);
    if (!country) return null;
    const rec = { country, source: o.source === 'auto' ? 'auto' : 'user' };
    writeStored(rec);
    if (o.persistRemote) profileWrite({ region: rec });
    try {
      document.dispatchEvent(new CustomEvent('chaupaal:region-changed', { detail: rec }));
    } catch (e) {}
    return rec;
  }

  /**
   * Sign-in sync: a region the user picked (here or on another device) wins over a detected one.
   * Returns profile fields to write when this device knows better ({} when nothing to write).
   */
  function hydrateFromProfile(profile) {
    const remote = profile && profile.region && validCountry(profile.region.country) ? profile.region : null;
    const local = getRegion();
    if (remote && (remote.source === 'user' || local.source !== 'user')) {
      writeStored({ country: validCountry(remote.country), source: remote.source === 'user' ? 'user' : 'auto' });
      return {};
    }
    return { region: local };
  }

  function intlWeekStart(country) {
    try {
      if (typeof Intl.Locale !== 'function') return null;
      const loc = new Intl.Locale('und-' + country);
      const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7;
    } catch (e) {}
    return null;
  }

  function intlHour12(country) {
    try {
      if (typeof Intl.Locale !== 'function') return null;
      const loc = new Intl.Locale('und-' + country);
      const cycles = typeof loc.getHourCycles === 'function' ? loc.getHourCycles() : loc.hourCycles;
      if (cycles && cycles.length) return cycles[0] === 'h12' || cycles[0] === 'h11';
    } catch (e) {}
    return null;
  }

  /** Defaults every surface should read region-dependent behaviour from (consumed from L6). */
  function getRegionPrefs(code) {
    const country = validCountry(code) || getRegion().country;
    const c = COUNTRIES[country];
    const detected = detectRegion();
    const deviceTz = deviceTimeZone();
    const weekStart = intlWeekStart(country);
    const hour12 = intlHour12(country);
    return {
      country,
      name: c.name,
      currency: c.currency,
      callingCode: c.callingCode,
      // The phone's clock when it is in this country (or we can't tell); else UTC as a neutral default.
      timeZone: detected.country === country || !TZ_COUNTRY[deviceTz] ? deviceTz || 'UTC' : 'UTC',
      firstDayOfWeek: weekStart != null ? weekStart : SUNDAY_START.has(country) ? 0 : SATURDAY_START.has(country) ? 6 : 1,
      hour12: hour12 != null ? hour12 : HOUR12.has(country),
      measurement: IMPERIAL.has(country) ? 'imperial' : country === 'GB' ? 'uk' : 'metric',
      contentRegion: country.toLowerCase(),
      contentArea: AREA_OF[country] || 'global',
    };
  }

  /** [{ code, name }] sorted for the picker; names localised via Intl.DisplayNames when available. */
  function listCountries(lang) {
    let dn = null;
    try {
      const e = typeof getLangEntry === 'function' ? getLangEntry(lang) : null;
      dn = new Intl.DisplayNames([e ? e.html : 'en', 'en'], { type: 'region' });
    } catch (e) {}
    return Object.values(COUNTRIES)
      .map((c) => {
        let name = c.name;
        try {
          name = (dn && dn.of(c.code)) || c.name;
        } catch (e) {}
        return { code: c.code, name, en: c.name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function countryName(code, lang) {
    const c = validCountry(code);
    if (!c) return '';
    try {
      const e = typeof getLangEntry === 'function' ? getLangEntry(lang) : null;
      return new Intl.DisplayNames([e ? e.html : 'en', 'en'], { type: 'region' }).of(c) || COUNTRIES[c].name;
    } catch (e) {
      return COUNTRIES[c].name;
    }
  }

  const api = {
    COUNTRIES,
    TZ_COUNTRY,
    detectRegion,
    getRegion,
    setRegion,
    hydrateFromProfile,
    getRegionPrefs,
    listCountries,
    countryName,
  };
  if (typeof window !== 'undefined') {
    window.ChaupaalRegion = api;
    window.getRegionPrefs = getRegionPrefs;
  }
  // Detect + store on first run so the region is stable from the first screen.
  try {
    getRegion();
  } catch (e) {}
})();
