export const PRIVACY_POLICY_URL = 'https://zurvis.io/privacy';
export const TERMS_URL = 'https://zurvis.io/terms';
export const PRIVACY_CONTACT_EMAIL = 'mail@zurvis.io';
export const PRIVACY_LAST_UPDATED = 'August 19, 2026';

export type PrivacyBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] };

export const PRIVACY_POLICY_BLOCKS: PrivacyBlock[] = [
  {
    type: 'paragraph',
    text: 'This Privacy Policy explains how Zurvis collects, uses, shares, and protects information when you use our website, dashboard, mobile app, APIs and messaging channel integrations, including WhatsApp Business Platform and TikTok.',
  },
  { type: 'heading', text: 'Your data belongs to you' },
  {
    type: 'bullets',
    items: [
      'We use your data only to run the service you have configured — to deliver, route, and secure your messages. We do not use it for any other purpose, and we never sell it or use it to train shared or public AI models.',
      'Our team can only see your basic account details — your name, email, phone number, and how many channels you have connected. We cannot access the content of your conversations or messages. Your data is completely safe and secured.',
      'We retain your data, including conversation data, for 365 days from when it was created or last active, after which it is automatically and permanently deleted from our systems. You can request earlier deletion at any time from the dashboard or by emailing us.',
    ],
  },
  { type: 'heading', text: '1. Who we are' },
  {
    type: 'paragraph',
    text: 'Zurvis is the data controller for the account and website data you provide to us. For end-user messages you send or receive through your connected channels, Zurvis acts as a data processor on your behalf, and you are the controller responsible for the lawful basis and notices to those end users.',
  },
  { type: 'heading', text: '2. Data we collect' },
  {
    type: 'bullets',
    items: [
      'Account data: name, email, company, password hash, billing details.',
      'Usage data: pages visited, features used, device, browser, IP address, log timestamps.',
      'Conversation data: messages, attachments, contact identifiers (phone number, profile name, social handles), conversation metadata, and any data your end users send through connected channels.',
      'Channel credentials: tokens needed to connect to WhatsApp, TikTok, Messenger, Instagram, etc.',
      'Cookies: session, preference, and analytics cookies (see Section 9).',
    ],
  },
  { type: 'heading', text: '3. How we use data' },
  {
    type: 'bullets',
    items: [
      'To provide, secure, and improve the service.',
      'To route messages between you and your end users on connected channels.',
      'To train and run AI features on your data, scoped to your workspace (we do not use your conversation data to train shared foundation models without your consent).',
      'To process payments and prevent fraud.',
      'To send service announcements and, with your consent, marketing.',
      'To comply with legal obligations and channel policies.',
    ],
  },
  { type: 'heading', text: '4. WhatsApp Business Platform data' },
  {
    type: 'paragraph',
    text: "When you connect a WhatsApp Business Account, Zurvis processes data on your behalf according to Meta's WhatsApp Business Solution Terms and Data Processing Terms:",
  },
  {
    type: 'bullets',
    items: [
      'We receive end-user phone numbers, WhatsApp profile names, and message content sent to your business number.',
      'We send messages back through the WhatsApp Cloud API on your instruction.',
      'You confirm you have obtained valid opt-in from each WhatsApp recipient and have provided them with your own privacy notice covering WhatsApp communications.',
      'You can request deletion of WhatsApp conversation data at any time from the dashboard or by emailing us.',
      "Meta is an independent controller for data it holds about WhatsApp users; their handling is governed by the WhatsApp Privacy Policy.",
    ],
  },
  { type: 'heading', text: '5. TikTok integration data' },
  {
    type: 'paragraph',
    text: "Zurvis is a TikTok Messaging partner — our TikTok integration covers TikTok direct messages only, not TikTok Shop or TikTok Ads. When you connect TikTok Messaging, Zurvis processes data on your behalf according to TikTok's Developer Terms and Data Processing Addendum:",
  },
  {
    type: 'bullets',
    items: [
      "We receive TikTok user identifiers, display names, and messages sent to your account through TikTok's official Messaging API.",
      'We only use TikTok user data to provide the messaging features you have enabled; we do not sell it or use it for unrelated advertising.',
      "You will obtain any consent required under TikTok's policies before initiating messages and will respect TikTok's reply windows.",
      'TikTok user data is deleted on user request, on disconnection of the integration, or when no longer needed for the purpose for which it was collected.',
      'TikTok is an independent controller for data it holds about its users; their handling is governed by the TikTok Privacy Policy.',
    ],
  },
  { type: 'heading', text: '6. Legal bases (GDPR/UK GDPR)' },
  {
    type: 'paragraph',
    text: 'We rely on: performance of contract (to deliver the service), legitimate interests (to secure and improve the service), consent (for marketing cookies and emails), and legal obligation (tax, fraud, regulatory requests).',
  },
  { type: 'heading', text: '7. Sharing' },
  {
    type: 'paragraph',
    text: 'We share data with subprocessors that help us run Zurvis (cloud hosting, payments, email delivery, error monitoring, AI model providers, channel partners like Meta and TikTok), all under appropriate contracts. We do not sell personal data. We may disclose data to comply with law or protect rights, property, and safety.',
  },
  { type: 'heading', text: '8. International transfers' },
  {
    type: 'paragraph',
    text: 'Data may be processed outside your country, including in the United States and the EU. Where required we rely on Standard Contractual Clauses or other approved transfer mechanisms.',
  },
  { type: 'heading', text: '9. Cookies' },
  {
    type: 'paragraph',
    text: 'We use strictly necessary cookies for login and security, and (with consent where required) analytics cookies to understand usage. You can manage cookies in your browser settings.',
  },
  { type: 'heading', text: '10. Retention' },
  {
    type: 'paragraph',
    text: 'We retain account and conversation data for 365 days from the date it was created or your last account activity, whichever is later, after which it is automatically and permanently deleted from our systems. You can request earlier deletion at any time from the dashboard or by emailing us. Some records (e.g., billing and invoicing data) may be retained for longer where required by law.',
  },
  { type: 'heading', text: '11. Your rights' },
  {
    type: 'paragraph',
    text: 'Depending on your jurisdiction, you may have rights to access, correct, delete, port, restrict, or object to processing of your personal data, and to withdraw consent. Contact us to exercise these rights. You may also complain to your local data protection authority.',
  },
  { type: 'heading', text: '12. Security' },
  {
    type: 'paragraph',
    text: 'We use encryption in transit and at rest, role-based access controls, audit logs, and regular security testing. No system is 100% secure; please use a strong password and enable 2FA.',
  },
  { type: 'heading', text: '13. Children' },
  {
    type: 'paragraph',
    text: 'Zurvis is not intended for children under 16. We do not knowingly collect their data.',
  },
  { type: 'heading', text: '14. Changes' },
  {
    type: 'paragraph',
    text: 'We will update this Policy from time to time. Material changes will be announced in-app or by email.',
  },
  { type: 'heading', text: '15. Contact' },
  {
    type: 'paragraph',
    text: `Privacy questions or requests: ${PRIVACY_CONTACT_EMAIL}.`,
  },
];
