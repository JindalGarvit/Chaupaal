// ===================== RAZORPAY PREMIUM SHEET =====================
function openPremiumSheet(){
  const sheet=document.createElement('div');sheet.className='premium-sheet';
  let selectedPlan='yearly';
  const plans={
    monthly:{amount:14900,label:'₹149/mo',blurb:'Flexible — cancel anytime'},
    yearly:{amount:89900,label:'₹899/yr',blurb:'Best value · ~₹75/mo'},
  };
  sheet.innerHTML=`
    <div style="display:flex;justify-content:flex-end;padding:16px;"><button id="closePremium" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;">✕</button></div>
    <div class="premium-hero">
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.65;margin-bottom:10px;">Chaupaal Premium</div>
      <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:26px;margin-bottom:8px;">More room to play</div>
      <div style="font-size:14px;opacity:0.7;line-height:1.5;">Unlimited freezes, smarter matches, and an ad-free Chaupaal — billed securely when payment is live.</div>
    </div>
    <div class="premium-perks">
      ${[['❄️','Unlimited streak freezes'],['🌳','Unlimited Peepal questions'],['📂','Unlimited custom categories'],['🤖','Unlimited AI keyboard'],['👥','See who viewed your Peepal posts'],['📊','Deeper matchmaking insights'],['🚫','Ad-free experience'],['💾','Priority archive (1000 items)']].map(([icon,text])=>`<div class="premium-perk"><div class="premium-perk-icon">${icon}</div><div style="font-size:13px;font-weight:600;">${text}</div></div>`).join('')}
    </div>
    <div class="premium-plan-row" id="premiumPlans">
      <div class="premium-plan" data-plan="monthly"><div style="font-size:11px;opacity:0.6;">Monthly</div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;">₹149</div><div style="font-size:10px;opacity:0.5;">/month</div></div>
      <div class="premium-plan selected" data-plan="yearly"><div style="font-size:9px;font-weight:700;color:var(--gold);margin-bottom:2px;">SAVE 40%</div><div style="font-size:11px;opacity:0.6;">Yearly</div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;">₹899</div><div style="font-size:10px;opacity:0.5;">/year · best value</div></div>
    </div>
    <div id="premiumPlanHint" style="text-align:center;padding:0 20px 12px;font-size:12px;color:rgba(255,255,255,0.55);">${plans.yearly.blurb}</div>
    <button class="premium-cta" id="premiumPayBtn">Continue with ${plans.yearly.label}</button>
    <div id="premiumPayStatus" style="text-align:center;padding:0 20px 8px;font-size:12px;color:rgba(255,255,255,0.45);min-height:18px;"></div>
    <div style="text-align:center;padding:0 20px 24px;font-size:11px;color:rgba(255,255,255,0.4);">Cancel anytime · Razorpay checkout when keys are live · No charge in preview</div>
  `;
  document.querySelector('.device').appendChild(sheet);
  const cta=document.getElementById('premiumPayBtn');
  const hint=document.getElementById('premiumPlanHint');
  const status=document.getElementById('premiumPayStatus');
  const paintPlan=()=>{
    const p=plans[selectedPlan];
    if(hint) hint.textContent=p.blurb;
    if(cta) cta.textContent=`Continue with ${p.label}`;
  };
  document.getElementById('closePremium').addEventListener('click',()=>sheet.remove());
  sheet.querySelectorAll('[data-plan]').forEach(el=>{
    el.addEventListener('click',()=>{
      selectedPlan=el.dataset.plan;
      sheet.querySelectorAll('[data-plan]').forEach(p=>p.classList.remove('selected'));
      el.classList.add('selected');
      paintPlan();
    });
  });
  cta.addEventListener('click',()=>{
    const amount=plans[selectedPlan].amount;
    cta.disabled=true;
    cta.textContent='Opening checkout…';
    if(status) status.textContent='';
    // Razorpay integration (live when Blaze + backend ready)
    if(typeof Razorpay!=='undefined' && window.CHAUPAAL_RAZORPAY_KEY){
      try{
        const rzp=new Razorpay({
          key:window.CHAUPAAL_RAZORPAY_KEY,
          amount,
          currency:'INR',
          name:'Chaupaal',
          description: selectedPlan==='yearly' ? 'Premium · yearly' : 'Premium · monthly',
          handler:()=>{
            if(typeof haptic==='function') haptic('success');
            showToast('Welcome to Premium');
            sheet.remove();
          },
          prefill:{name:userProfile?.name||'',email:userProfile?.email||''},
          theme:{color:'#E63946'},
          modal:{ondismiss:()=>{cta.disabled=false;paintPlan();if(status)status.textContent='Checkout closed — nothing was charged.';}}
        });
        rzp.open();
      }catch(e){
        cta.disabled=false;
        paintPlan();
        if(status) status.textContent='Could not open Razorpay. Try again later.';
      }
    } else {
      setTimeout(()=>{
        cta.disabled=false;
        paintPlan();
        if(status) status.textContent='Payments are in preview — we\'ll notify you when checkout is live.';
        showToast('Premium checkout coming soon — you\'ll get a ping when it\'s ready.');
      },450);
    }
  });
}
