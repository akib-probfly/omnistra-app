const COUNTRY_DIAL_CODES_URL = 'https://countriesnow.space/api/v0.1/countries/codes';

type CountryDialCodesResponse = {
  error?: boolean;
  data?: Array<{
    name?: string;
    code?: string;
    dial_code?: string;
  }>;
};

export type CountryDialCode = {
  name: string;
  isoCode: string;
  dialCode: string;
};

export const countryDialCodeQueryKey = ['reference', 'country-dial-codes'] as const;

export async function fetchCountryDialCodes(): Promise<CountryDialCode[]> {
  const response = await fetch(COUNTRY_DIAL_CODES_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Could not load country calling codes');

  const payload = (await response.json()) as CountryDialCodesResponse;
  if (payload.error || !Array.isArray(payload.data)) {
    throw new Error('Country calling-code response was invalid');
  }

  return payload.data
    .map((country): CountryDialCode | null => {
      const name = country.name?.trim();
      const isoCode = country.code?.trim().toUpperCase();
      const dialCode = country.dial_code?.replace(/\D/g, '');
      return name && isoCode && dialCode ? { name, isoCode, dialCode } : null;
    })
    .filter((country): country is CountryDialCode => Boolean(country))
    .sort((left, right) => left.name.localeCompare(right.name));
}
