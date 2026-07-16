// ===================== FIREBASE =====================
const firebaseConfig = {
  apiKey: "AIzaSyA1JtxTBu3_4OOBrT7NUTH7zy43ROioCcA",
  authDomain: "chaupaal-chaupaal.firebaseapp.com",
  databaseURL: "https://chaupaal-chaupaal-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chaupaal-chaupaal",
  storageBucket: "chaupaal-chaupaal.firebasestorage.app",
  messagingSenderId: "484819939341",
  appId: "1:484819939341:web:81429b809fbe3b1733e544"
};
let db=null,auth=null,rtdb=null,storage=null;
let currentUser=null,userProfile=null;
try{
  firebase.initializeApp(firebaseConfig);
  db=firebase.firestore();
  auth=firebase.auth();
  rtdb=firebase.database();
  storage=firebase.storage();
  // Analytics initialized lazily in core/analytics.js (Phase 5)
}catch(e){ console.warn("Firebase init error",e.message); }

async function fetchTodaysContent(){
  if(!db) return null;
  try{
    const today=new Date().toISOString().split('T')[0];
    const timeout=new Promise(r=>setTimeout(()=>r(null),3000));
    const stripUnverifiedLink=(doc)=>{
      // Existing daily_sets / bonus_pool docs may have mismatched links — never surface them.
      // New docs should omit link unless verified (see CONTENT.md).
      const data={...doc};
      delete data.link;
      return data;
    };
    const fetchData=async()=>{
      const snap=await db.collection("daily_sets").doc(today).collection("questions").orderBy("__name__").get();
      const bonus=await db.collection("bonus_pool").orderBy("added_at","desc").limit(5).get();
      const qs=snap.docs.map(d=>stripUnverifiedLink(d.data()));
      if(qs.length===0) return null;
      return{questions:qs,bonus:bonus.docs.map(d=>stripUnverifiedLink(d.data()))};
    };
    return await Promise.race([fetchData(),timeout]);
  }catch(e){ return null; }
}