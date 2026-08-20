// ===================== MEMBERSHIP (legacy openPremiumSheet alias) =====================
function openPremiumSheet() {
  if (typeof ChaupaalMoney !== 'undefined' && typeof ChaupaalMoney.openMembership === 'function') {
    ChaupaalMoney.openMembership();
    return;
  }
  if (typeof showToast === 'function') {
    showToast('Membership — open Chaupaal Profile hub');
  }
}
