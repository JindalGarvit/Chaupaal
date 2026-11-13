/**
 * Data inventory (Global L9) — the single source for store privacy labels
 * (scripts/gen-privacy-labels.js → docs/store/privacy-labels.v*.{json,md}).
 * Built from the L8 processor list + actual data flows (export / purge maps). Update this file
 * whenever a feature starts collecting something new; the generator + test keep the docs in sync.
 *
 *   linked     tied to the user's identity
 *   tracking   used to track across other companies' apps/sites (Apple definition) — never, by design
 *   optional   user can choose not to provide / switch off
 *   shared     leaves Chaupaal to a third party that is NOT our processor (Google "sharing") — none
 */
'use strict';

const VERSION = 1;

/** [id, appleCategory, appleType, googleCategory, googleType, purposes, linked, optional, processors] */
const DATA = [
  ['name', 'Contact Info', 'Name', 'Personal info', 'Name', ['app_functionality'], true, false, ['firebase']],
  ['email', 'Contact Info', 'Email Address', 'Personal info', 'Email address', ['app_functionality', 'account_management', 'developer_communications'], true, true, ['firebase', 'resend']],
  ['phone', 'Contact Info', 'Phone Number', 'Personal info', 'Phone number', ['app_functionality', 'account_management'], true, true, ['firebase']],
  ['user_id', 'Identifiers', 'User ID', 'Personal info', 'User IDs', ['app_functionality', 'analytics', 'fraud_prevention'], true, false, ['firebase', 'vercel', 'upstash']],
  ['device_id', 'Identifiers', 'Device ID', 'Device or other IDs', 'Device or other IDs', ['app_functionality', 'analytics'], true, false, ['firebase', 'analytics']],
  ['dob', 'Other Data', 'Other Data Types (date of birth)', 'Personal info', 'Other info (date of birth)', ['app_functionality', 'compliance'], true, false, ['firebase']],
  ['gender', 'Sensitive Info', 'Sensitive Info (gender)', 'Personal info', 'Other info (gender)', ['app_functionality', 'personalization'], true, true, ['firebase']],
  ['coarse_location', 'Location', 'Coarse Location', 'Location', 'Approximate location', ['app_functionality', 'personalization'], true, true, ['firebase', 'osm']],
  ['precise_location', 'Location', 'Precise Location', 'Location', 'Precise location', ['app_functionality'], true, true, ['firebase']],
  ['messages', 'User Content', 'Emails or Text Messages', 'Messages', 'Other in-app messages', ['app_functionality'], true, false, ['firebase']],
  ['photos_videos', 'User Content', 'Photos or Videos', 'Photos and videos', 'Photos', ['app_functionality'], true, true, ['cloudinary']],
  ['audio', 'User Content', 'Audio Data', 'Audio', 'Voice or sound recordings', ['app_functionality'], true, true, ['agora', 'cloudinary']],
  ['user_content', 'User Content', 'Other User Content', 'App activity', 'Other user-generated content', ['app_functionality'], true, false, ['firebase']],
  ['contacts', 'Contacts', 'Contacts', 'Contacts', 'Contacts', ['app_functionality'], true, true, ['firebase']],
  ['search_history', 'Search History', 'Search History', 'App activity', 'In-app search history', ['personalization'], true, true, ['firebase']],
  ['interactions', 'Usage Data', 'Product Interaction', 'App activity', 'App interactions', ['analytics', 'personalization'], true, true, ['firebase', 'analytics']],
  ['crash', 'Diagnostics', 'Crash Data', 'App info and performance', 'Crash logs', ['app_functionality'], true, true, ['firebase', 'vercel']],
  ['purchases', 'Purchases', 'Purchase History', 'Financial info', 'Purchase history', ['app_functionality'], true, true, ['razorpay', 'firebase']],
  ['payment_info', 'Financial Info', 'Payment Info', 'Financial info', 'User payment info', ['app_functionality'], true, true, ['razorpay']],
];

const PURPOSE_LABELS = {
  app_functionality: ['App Functionality', 'App functionality'],
  account_management: ['App Functionality', 'Account management'],
  developer_communications: ['Developer’s Advertising or Marketing', 'Developer communications'],
  analytics: ['Analytics', 'Analytics'],
  personalization: ['Product Personalization', 'Personalization'],
  fraud_prevention: ['App Functionality', 'Fraud prevention, security, and compliance'],
  compliance: ['App Functionality', 'Fraud prevention, security, and compliance'],
};

const FACTS = {
  tracking: false,
  sellsData: false,
  encryptedInTransit: true,
  deletionRequest: { inApp: true, web: '/delete-account' },
  childrenPolicy: 'No accounts under 13; Teen mode for 13–17 (see Children & Teens notice)',
  thirdPartyAdvertising: false,
};

function inventory() {
  return DATA.map(([id, appleCategory, appleType, googleCategory, googleType, purposes, linked, optional, processors]) => ({
    id,
    apple: { category: appleCategory, type: appleType },
    google: { category: googleCategory, type: googleType },
    purposes,
    linked,
    optional,
    tracking: false,
    shared: false,
    processors,
  }));
}

module.exports = { VERSION, DATA, PURPOSE_LABELS, FACTS, inventory };
