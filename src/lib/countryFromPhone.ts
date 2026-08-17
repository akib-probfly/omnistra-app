// Longest-prefix calling codes, matching intl-tel-input's phone-based country detection.
const CALLING_CODE_TO_ISO: Array<[string, string]> = [
  ['1684', 'AS'], ['1264', 'AI'], ['1268', 'AG'], ['1242', 'BS'], ['1246', 'BB'],
  ['1441', 'BM'], ['1284', 'VG'], ['1345', 'KY'], ['1767', 'DM'], ['1809', 'DO'],
  ['1829', 'DO'], ['1849', 'DO'], ['1473', 'GD'], ['1671', 'GU'], ['1876', 'JM'],
  ['1664', 'MS'], ['1670', 'MP'], ['1787', 'PR'], ['1939', 'PR'], ['1869', 'KN'],
  ['1758', 'LC'], ['1784', 'VC'], ['1649', 'TC'], ['1340', 'VI'], ['1721', 'SX'],
  ['1868', 'TT'],
  ['880', 'BD'], ['971', 'AE'], ['966', 'SA'], ['974', 'QA'], ['973', 'BH'],
  ['965', 'KW'], ['968', 'OM'], ['961', 'LB'], ['962', 'JO'], ['963', 'SY'],
  ['964', 'IQ'], ['970', 'PS'], ['972', 'IL'], ['998', 'UZ'], ['996', 'KG'],
  ['993', 'TM'], ['992', 'TJ'], ['994', 'AZ'], ['995', 'GE'], ['977', 'NP'],
  ['975', 'BT'], ['976', 'MN'], ['960', 'MV'], ['856', 'LA'], ['855', 'KH'],
  ['853', 'MO'], ['852', 'HK'], ['886', 'TW'], ['850', 'KP'], ['670', 'TL'],
  ['673', 'BN'], ['675', 'PG'], ['676', 'TO'], ['677', 'SB'], ['678', 'VU'],
  ['679', 'FJ'], ['680', 'PW'], ['681', 'WF'], ['682', 'CK'], ['683', 'NU'],
  ['685', 'WS'], ['686', 'KI'], ['687', 'NC'], ['688', 'TV'], ['689', 'PF'],
  ['690', 'TK'], ['691', 'FM'], ['692', 'MH'], ['358', 'FI'], ['354', 'IS'],
  ['353', 'IE'], ['352', 'LU'], ['351', 'PT'], ['350', 'GI'], ['377', 'MC'],
  ['376', 'AD'], ['375', 'BY'], ['374', 'AM'], ['373', 'MD'], ['372', 'EE'],
  ['371', 'LV'], ['370', 'LT'], ['386', 'SI'], ['385', 'HR'], ['387', 'BA'],
  ['389', 'MK'], ['382', 'ME'], ['383', 'XK'], ['381', 'RS'], ['380', 'UA'],
  ['355', 'AL'], ['359', 'BG'], ['357', 'CY'], ['356', 'MT'], ['420', 'CZ'],
  ['421', 'SK'], ['423', 'LI'], ['500', 'FK'], ['501', 'BZ'], ['502', 'GT'],
  ['503', 'SV'], ['504', 'HN'], ['505', 'NI'], ['506', 'CR'], ['507', 'PA'],
  ['508', 'PM'], ['509', 'HT'], ['590', 'GP'], ['591', 'BO'], ['592', 'GY'],
  ['593', 'EC'], ['594', 'GF'], ['595', 'PY'], ['596', 'MQ'], ['597', 'SR'],
  ['598', 'UY'], ['599', 'CW'], ['212', 'MA'], ['213', 'DZ'], ['216', 'TN'],
  ['218', 'LY'], ['220', 'GM'], ['221', 'SN'], ['222', 'MR'], ['223', 'ML'],
  ['224', 'GN'], ['225', 'CI'], ['226', 'BF'], ['227', 'NE'], ['228', 'TG'],
  ['229', 'BJ'], ['230', 'MU'], ['231', 'LR'], ['232', 'SL'], ['233', 'GH'],
  ['234', 'NG'], ['235', 'TD'], ['236', 'CF'], ['237', 'CM'], ['238', 'CV'],
  ['239', 'ST'], ['240', 'GQ'], ['241', 'GA'], ['242', 'CG'], ['243', 'CD'],
  ['244', 'AO'], ['245', 'GW'], ['246', 'IO'], ['248', 'SC'], ['249', 'SD'],
  ['250', 'RW'], ['251', 'ET'], ['252', 'SO'], ['253', 'DJ'], ['254', 'KE'],
  ['255', 'TZ'], ['256', 'UG'], ['257', 'BI'], ['258', 'MZ'], ['260', 'ZM'],
  ['261', 'MG'], ['262', 'RE'], ['263', 'ZW'], ['264', 'NA'], ['265', 'MW'],
  ['266', 'LS'], ['267', 'BW'], ['268', 'SZ'], ['269', 'KM'], ['290', 'SH'],
  ['291', 'ER'], ['297', 'AW'], ['298', 'FO'], ['299', 'GL'],
  ['20', 'EG'], ['27', 'ZA'], ['30', 'GR'], ['31', 'NL'], ['32', 'BE'],
  ['33', 'FR'], ['34', 'ES'], ['36', 'HU'], ['39', 'IT'], ['40', 'RO'],
  ['41', 'CH'], ['43', 'AT'], ['44', 'GB'], ['45', 'DK'], ['46', 'SE'],
  ['47', 'NO'], ['48', 'PL'], ['49', 'DE'], ['51', 'PE'], ['52', 'MX'],
  ['53', 'CU'], ['54', 'AR'], ['55', 'BR'], ['56', 'CL'], ['57', 'CO'],
  ['58', 'VE'], ['60', 'MY'], ['61', 'AU'], ['62', 'ID'], ['63', 'PH'],
  ['64', 'NZ'], ['65', 'SG'], ['66', 'TH'], ['81', 'JP'], ['82', 'KR'],
  ['84', 'VN'], ['86', 'CN'], ['90', 'TR'], ['91', 'IN'], ['92', 'PK'],
  ['93', 'AF'], ['94', 'LK'], ['95', 'MM'], ['98', 'IR'],
  ['1', 'US'], ['7', 'RU'],
];

const SORTED_CALLING_CODES = [...CALLING_CODE_TO_ISO].sort((left, right) => right[0].length - left[0].length);

const ISO_TO_NAME: Record<string, string> = {
  AD: 'Andorra', AE: 'United Arab Emirates', AF: 'Afghanistan', AG: 'Antigua and Barbuda',
  AI: 'Anguilla', AL: 'Albania', AM: 'Armenia', AO: 'Angola', AR: 'Argentina',
  AS: 'American Samoa', AT: 'Austria', AU: 'Australia', AW: 'Aruba', AZ: 'Azerbaijan',
  BA: 'Bosnia and Herzegovina', BB: 'Barbados', BD: 'Bangladesh', BE: 'Belgium',
  BF: 'Burkina Faso', BG: 'Bulgaria', BH: 'Bahrain', BI: 'Burundi', BJ: 'Benin',
  BM: 'Bermuda', BN: 'Brunei', BO: 'Bolivia', BR: 'Brazil', BS: 'Bahamas',
  BT: 'Bhutan', BW: 'Botswana', BY: 'Belarus', BZ: 'Belize', CA: 'Canada',
  CD: 'DR Congo', CF: 'Central African Republic', CG: 'Congo', CH: 'Switzerland',
  CI: 'Ivory Coast', CK: 'Cook Islands', CL: 'Chile', CM: 'Cameroon', CN: 'China',
  CO: 'Colombia', CR: 'Costa Rica', CU: 'Cuba', CV: 'Cape Verde', CW: 'Curaçao',
  CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DJ: 'Djibouti', DK: 'Denmark',
  DM: 'Dominica', DO: 'Dominican Republic', DZ: 'Algeria', EC: 'Ecuador', EE: 'Estonia',
  EG: 'Egypt', ER: 'Eritrea', ES: 'Spain', ET: 'Ethiopia', FI: 'Finland', FJ: 'Fiji',
  FK: 'Falkland Islands', FM: 'Micronesia', FO: 'Faroe Islands', FR: 'France',
  GA: 'Gabon', GB: 'United Kingdom', GD: 'Grenada', GE: 'Georgia', GF: 'French Guiana',
  GH: 'Ghana', GI: 'Gibraltar', GL: 'Greenland', GM: 'Gambia', GN: 'Guinea',
  GP: 'Guadeloupe', GQ: 'Equatorial Guinea', GR: 'Greece', GT: 'Guatemala',
  GU: 'Guam', GW: 'Guinea-Bissau', GY: 'Guyana', HK: 'Hong Kong', HN: 'Honduras',
  HR: 'Croatia', HT: 'Haiti', HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland',
  IL: 'Israel', IN: 'India', IO: 'British Indian Ocean Territory', IQ: 'Iraq',
  IR: 'Iran', IS: 'Iceland', IT: 'Italy', JM: 'Jamaica', JO: 'Jordan', JP: 'Japan',
  KE: 'Kenya', KG: 'Kyrgyzstan', KH: 'Cambodia', KI: 'Kiribati', KM: 'Comoros',
  KN: 'Saint Kitts and Nevis', KP: 'North Korea', KR: 'South Korea', KW: 'Kuwait',
  KY: 'Cayman Islands', KZ: 'Kazakhstan', LA: 'Laos', LB: 'Lebanon', LC: 'Saint Lucia',
  LI: 'Liechtenstein', LK: 'Sri Lanka', LR: 'Liberia', LS: 'Lesotho', LT: 'Lithuania',
  LU: 'Luxembourg', LV: 'Latvia', LY: 'Libya', MA: 'Morocco', MC: 'Monaco',
  MD: 'Moldova', ME: 'Montenegro', MG: 'Madagascar', MH: 'Marshall Islands',
  MK: 'North Macedonia', ML: 'Mali', MM: 'Myanmar', MN: 'Mongolia', MO: 'Macau',
  MP: 'Northern Mariana Islands', MQ: 'Martinique', MR: 'Mauritania', MS: 'Montserrat',
  MT: 'Malta', MU: 'Mauritius', MV: 'Maldives', MW: 'Malawi', MX: 'Mexico',
  MY: 'Malaysia', MZ: 'Mozambique', NA: 'Namibia', NC: 'New Caledonia', NE: 'Niger',
  NG: 'Nigeria', NI: 'Nicaragua', NL: 'Netherlands', NO: 'Norway', NP: 'Nepal',
  NU: 'Niue', NZ: 'New Zealand', OM: 'Oman', PA: 'Panama', PE: 'Peru',
  PF: 'French Polynesia', PG: 'Papua New Guinea', PH: 'Philippines', PK: 'Pakistan',
  PL: 'Poland', PM: 'Saint Pierre and Miquelon', PR: 'Puerto Rico', PS: 'Palestine',
  PT: 'Portugal', PW: 'Palau', PY: 'Paraguay', QA: 'Qatar', RE: 'Réunion',
  RO: 'Romania', RS: 'Serbia', RU: 'Russia', RW: 'Rwanda', SA: 'Saudi Arabia',
  SB: 'Solomon Islands', SC: 'Seychelles', SD: 'Sudan', SE: 'Sweden', SG: 'Singapore',
  SH: 'Saint Helena', SI: 'Slovenia', SK: 'Slovakia', SL: 'Sierra Leone',
  SN: 'Senegal', SO: 'Somalia', SR: 'Suriname', ST: 'São Tomé and Príncipe',
  SV: 'El Salvador', SX: 'Sint Maarten', SY: 'Syria', SZ: 'Eswatini',
  TC: 'Turks and Caicos Islands', TD: 'Chad', TG: 'Togo', TH: 'Thailand',
  TJ: 'Tajikistan', TK: 'Tokelau', TL: 'Timor-Leste', TM: 'Turkmenistan',
  TN: 'Tunisia', TO: 'Tonga', TR: 'Turkey', TT: 'Trinidad and Tobago', TV: 'Tuvalu',
  TW: 'Taiwan', TZ: 'Tanzania', UA: 'Ukraine', UG: 'Uganda', US: 'United States',
  UY: 'Uruguay', UZ: 'Uzbekistan', VC: 'Saint Vincent and the Grenadines',
  VE: 'Venezuela', VG: 'British Virgin Islands', VI: 'U.S. Virgin Islands',
  VN: 'Vietnam', VU: 'Vanuatu', WF: 'Wallis and Futuna', WS: 'Samoa',
  XK: 'Kosovo', YE: 'Yemen', ZA: 'South Africa', ZM: 'Zambia', ZW: 'Zimbabwe',
};

export function getCountryCodeFromPhone(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) return null;

  for (const [dialCode, isoCode] of SORTED_CALLING_CODES) {
    if (digits.startsWith(dialCode)) return isoCode;
  }

  return null;
}

export function getCountryNameFromCode(countryCode: string | null | undefined): string | null {
  const iso = countryCode?.trim().toUpperCase();
  if (!iso) return null;
  return ISO_TO_NAME[iso] ?? null;
}

export function listCountryCallingCodes() {
  const seen = new Set<string>();
  const items: Array<{ dialCode: string; isoCode: string; name: string }> = [];
  for (const [dialCode, isoCode] of CALLING_CODE_TO_ISO) {
    if (seen.has(dialCode)) continue;
    seen.add(dialCode);
    items.push({ dialCode, isoCode, name: ISO_TO_NAME[isoCode] ?? isoCode });
  }
  return items.sort((left, right) => left.name.localeCompare(right.name));
}
