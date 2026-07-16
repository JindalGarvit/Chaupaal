// ===================== RAZORPAY PREMIUM SHEET =====================
function openPremiumSheet(){
  const sheet=document.createElement('div');sheet.className='premium-sheet';
  let selectedPlan='monthly';
  sheet.innerHTML=`
    <div style="display:flex;justify-content:flex-end;padding:16px;"><button id="closePremium" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;">✕</button></div>
    <div class="premium-hero">
      <div style="font-size:48px;margin-bottom:12px;">⭐</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:26px;margin-bottom:8px;">Chaupaal Premium</div>
      <div style="font-size:14px;opacity:0.7;line-height:1.5;">The full Chaupaal experience — unlimited, ad-free, and smarter.</div>
    </div>
    <div class="premium-perks">
      ${[['❄️','Unlimited streak freezes'],['🌳','Unlimited Peepal questions (5→unlimited/week)'],['📂','Unlimited custom categories'],['🤖','Unlimited AI keyboard queries (5/day→unlimited)'],['👥','See who viewed your Peepal posts'],['📊','Detailed personality & matchmaking insights'],['🚫','Ad-free experience'],['💾','Priority archive storage (1000 items)']].map(([icon,text])=>`<div class="premium-perk"><div class="premium-perk-icon">${icon}</div><div style="font-size:13px;font-weight:600;">${text}</div></div>`).join('')}
    </div>
    <div class="premium-plan-row" id="premiumPlans">
      <div class="premium-plan selected" data-plan="monthly"><div style="font-size:11px;opacity:0.6;">Monthly</div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;">₹149</div><div style="font-size:10px;opacity:0.5;">/month</div></div>
      <div class="premium-plan" data-plan="yearly"><div style="font-size:9px;font-weight:700;color:var(--gold);margin-bottom:2px;">SAVE 40%</div><div style="font-size:11px;opacity:0.6;">Yearly</div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;">₹899</div><div style="font-size:10px;opacity:0.5;">/year</div></div>
    </div>
    <button class="premium-cta" id="premiumPayBtn">🚀 Get Premium</button>
    <div style="text-align:center;padding:0 20px 20px;font-size:11px;color:rgba(255,255,255,0.4);">Cancel anytime · Secure payment via Razorpay</div>
  `;
  document.querySelector('.device').appendChild(sheet);
  document.getElementById('closePremium').addEventListener('click',()=>sheet.remove());
  sheet.querySelectorAll('[data-plan]').forEach(el=>{
    el.addEventListener('click',()=>{selectedPlan=el.dataset.plan;sheet.querySelectorAll('[data-plan]').forEach(p=>p.classList.remove('selected'));el.classList.add('selected');});
  });
  document.getElementById('premiumPayBtn').addEventListener('click',()=>{
    // Razorpay integration (live when Blaze + backend ready)
    if(typeof Razorpay!=='undefined'){
      const amount=selectedPlan==='monthly'?14900:89900;
      const rzp=new Razorpay({key:'rzp_live_XXXX',amount,currency:'INR',name:'Chaupaal',description:'Premium Subscription',handler:()=>{showToast('Welcome to Premium! ⭐');sheet.remove();},prefill:{name:userProfile?.name||'',email:userProfile?.email||''},theme:{color:'#E63946'}});
      rzp.open();
    } else {
      showToast('Payment system activating soon! We\'ll notify you when ready. 🚀');
    }
  });
}
