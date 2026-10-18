// ===================== MEMBERSHIP (legacy openPremiumSheet alias) =====================
function openPremiumSheet() {
  if (typeof ChaupaalMoney !== 'undefined' && typeof ChaupaalMoney.openMembership === 'function') {
    ChaupaalMoney.openMembership();
    return;
  }
  if (typeof showToast === 'function') {
    showToast(t('settings.membership_open_chaupaal_profile_hub'));
  }
}
