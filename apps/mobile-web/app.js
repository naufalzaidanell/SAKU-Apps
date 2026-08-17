(() => {
  'use strict';
  let cfg = window.__SAKU_CONFIG__ || {};
  const root = document.getElementById('root');
  const toastEl = document.getElementById('toast');
  const state = {
    accessToken: null, user: null, merchant: null, products: [], dashboard: null, report: null,
    cart: new Map(), paymentMethod: 'CASH', page: 'dashboard', period: 'daily', eventSource: null,
    refreshInFlight: null, imageUrls: new Map(), expenses: null, reportLoading: false, expensesLoading: false,
    prefs: null, profilePhoto: null, onboarding: null, kbliResults: [], kbliQuery: '', onboardingBusy: false,
    productSales: null, productSalesLoading: false, topProductsIndex: 0, topProductsTimer: null,
  };
  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const rupiah = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const esc = s => String(s??'').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uid = () => { if (crypto.randomUUID) return crypto.randomUUID(); const b=new Uint8Array(16); crypto.getRandomValues(b); b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128; const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join(''); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
  const toast = msg => { toastEl.textContent=msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove('show'),2600); };
  const approvedOrigins={uat:'https://saku-backend-live-production.up.railway.app',production:'https://saku-backend-production.up.railway.app'};
  const apiConfigured = () => approvedOrigins[String(cfg.environment||'').toLowerCase()]===String(cfg.apiBaseUrl||'').replace(/\/$/,'') && String(cfg.onboardingBaseUrl||cfg.apiBaseUrl||'').replace(/\/$/,'')===String(cfg.apiBaseUrl||'').replace(/\/$/,'');
  const plugins = () => window.Capacitor?.Plugins || {};
  const secure = () => plugins().SakuSecureSession;
  const reportExport = () => plugins().SakuReportExport;
  let currentTheme = 'light';
  const appearance = () => plugins().SakuAppearance;
  function applyTheme(theme){
    currentTheme=theme==='dark'?'dark':'light';
    document.documentElement.dataset.theme=currentTheme;
    const meta=document.querySelector('meta[name=\"theme-color\"]');
    if(meta)meta.setAttribute('content',currentTheme==='dark'?'#0d1511':'#0b8f58');
    return currentTheme;
  }
  async function loadThemePreference(){
    try{if(appearance()?.get){const out=await appearance().get();return applyTheme(out.theme);}}catch{}
    return applyTheme('light');
  }
  async function setTheme(theme){
    const next=applyTheme(theme);
    try{if(appearance()?.set)await appearance().set({theme:next});}catch{}
    return next;
  }
  function appearanceSetting(){
    const dark=currentTheme==='dark';
    return `<section class=\"appearance-setting\"><div><b>Mode Gelap</b><small>Gunakan tampilan gelap di seluruh aplikasi.</small></div><button type=\"button\" class=\"theme-toggle ${dark?'on':''}\" id=\"themeToggle\" role=\"switch\" aria-checked=\"${dark}\"><span></span><em>${dark?'Aktif':'Nonaktif'}</em></button></section>`;
  }
  const defaultPrefs=()=>({confirmPayment:true,lowStockAlert:true,receiptContact:true,receiptNote:'Terima kasih telah berbelanja.',productsSold:'',businessWhatsapp:'',city:''});
  function prefsKey(){return `saku_merchant_prefs_${state.merchant?.id||'default'}`;}
  function loadPrefs(){
    if(state.prefs)return state.prefs;
    try{state.prefs={...defaultPrefs(),...JSON.parse(localStorage.getItem(prefsKey())||'{}')};}catch{state.prefs=defaultPrefs();}
    try{state.profilePhoto=localStorage.getItem(`${prefsKey()}_photo`)||null;}catch{}
    return state.prefs;
  }
  function savePrefs(next){state.prefs={...defaultPrefs(),...(state.prefs||{}),...next};try{localStorage.setItem(prefsKey(),JSON.stringify(state.prefs));}catch{}return state.prefs;}
  async function saveProfilePhoto(file){
    if(!file)return; if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('FORMAT_FOTO_TIDAK_DIDUKUNG');if(file.size>6*1024*1024)throw new Error('IMAGE_TOO_LARGE');
    const bmp=await createImageBitmap(file),max=256,scale=Math.min(1,max/Math.max(bmp.width,bmp.height));
    if(bmp.width*bmp.height>80000000){bmp.close?.();throw new Error('IMAGE_DIMENSIONS_TOO_LARGE');}
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bmp.width*scale));c.height=Math.max(1,Math.round(bmp.height*scale));c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close?.();
    const data=await new Promise((resolve,reject)=>{const x=c.toDataURL('image/jpeg',.78);x?resolve(x):reject(new Error('IMAGE_PROCESS_FAILED'));});
    state.profilePhoto=data;try{localStorage.setItem(`${prefsKey()}_photo`,data);}catch{}
  }
  const navIcon = name => ({
    dashboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z"/></svg>',
    cashier:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14l1 5H4zM4 8v13h16V8M8 12h8M8 16h3"/></svg>',
    products:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/></svg>',
    report:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
  }[name] || '');
  const walletMark = () => '<svg class="wallet-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/></svg>';
  const RC8I={wallet:'<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/>',receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',trend:'<path d="m3 17 6-6 4 4 7-8"/><path d="M14 7h6v6"/>',expense:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',cash:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 9H5v2M17 15h2v-2"/>',qr:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3"/>',box:'<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',cart:'<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.5 11h11l2-7H7"/>',plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',camera:'<path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2Z"/><circle cx="12" cy="13" r="3"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/>',logout:'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 20 20 0 0 1-8.7-3.1 19.5 19.5 0 0 1-6-6A20 20 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7"/>',download:'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',chev:'<path d="m9 18 6-6-6-6"/>',check:'<path d="m5 12 4 4L19 6"/>',alert:'<path d="M12 3 2 21h20Z"/><path d="M12 9v5M12 17h.01"/>',chart:'<path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/>'};
  const rc8Icon=(n,c='')=>`<svg class="icon ${c}" viewBox="0 0 24 24" aria-hidden="true">${RC8I[n]||RC8I.info}</svg>`;



  const ENTRY_KEY='saku_entry_experience_v2';
  const ENTRY_VERSION=2;
  const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  function readEntry(){
    try{return {version:ENTRY_VERSION,language:'id',languageConfirmed:false,featureIndex:0,preAuthComplete:false,...JSON.parse(localStorage.getItem(ENTRY_KEY)||'{}')};}
    catch{return {version:ENTRY_VERSION,language:'id',languageConfirmed:false,featureIndex:0,preAuthComplete:false};}
  }
  function writeEntry(patch){
    const next={...readEntry(),...patch,version:ENTRY_VERSION};
    try{localStorage.setItem(ENTRY_KEY,JSON.stringify(next));}catch{}
    return next;
  }
  function launchIllustration(kind){
    const common='viewBox="0 0 240 170" role="img" aria-hidden="true"';
    if(kind==='products')return `<svg ${common}><rect x="32" y="38" width="176" height="100" rx="24" class="ill-surface"/><path d="M72 69h38v38H72zM130 69h38v38h-38z" class="ill-line"/><path d="M78 119h84" class="ill-line"/><circle cx="178" cy="47" r="19" class="ill-accent"/><path d="M169 47h18M178 38v18" class="ill-white"/></svg>`;
    if(kind==='cashier')return `<svg ${common}><rect x="38" y="31" width="164" height="108" rx="25" class="ill-surface"/><path d="M60 61h77M60 83h52M60 105h64" class="ill-line"/><rect x="145" y="60" width="37" height="48" rx="12" class="ill-accent"/><path d="M155 75h17M155 86h17M155 97h10" class="ill-white"/></svg>`;
    if(kind==='report')return `<svg ${common}><rect x="35" y="33" width="170" height="105" rx="25" class="ill-surface"/><path d="M59 111V91M91 111V72M123 111V82M155 111V55M59 120h112" class="ill-line"/><path d="m59 78 32-18 32 10 42-31" class="ill-accent-line"/><circle cx="165" cy="39" r="8" class="ill-accent"/></svg>`;
    return `<svg ${common}><path d="M55 57h130v77H55a20 20 0 0 1-20-20V77a20 20 0 0 1 20-20Z" class="ill-surface"/><path d="M55 57V43a15 15 0 0 1 15-15h89a15 15 0 0 1 15 15v14" class="ill-line"/><rect x="132" y="78" width="63" height="38" rx="16" class="ill-accent"/><circle cx="158" cy="97" r="6" class="ill-white"/></svg>`;
  }
  function cinematicIntro(next){
    let done=false;
    const finish=()=>{if(done)return;done=true;try{next();}catch{authView();}};
    try{
      root.innerHTML=`<main class="launch-cinematic" id="launchCinema" aria-label="SAKU"><div class="launch-glow"></div><div class="launch-brand"><div class="launch-wallet">${walletMark()}<span class="launch-receipt"></span></div><div class="launch-wordmark">SAKU</div><div class="launch-tagline">Transaksi Mudah, Kreatif, Unggul.</div></div></main>`;
      const el=$('#launchCinema'); requestAnimationFrame(()=>el?.classList.add('play'));
      setTimeout(finish,reducedMotion()?60:1620);
    }catch{finish();}
  }
  function languageView(){
    root.innerHTML=`<main class="entry-shell"><section class="entry-card entry-rise"><div class="entry-logo">${walletMark()}</div><div class="entry-eyebrow">Selamat datang di SAKU</div><h1>Pilih bahasa</h1><p class="entry-lead">Bahasa ini digunakan untuk pengalaman awal SAKU.</p><button class="choice-card selected" id="languageId" type="button"><span class="choice-flag">ID</span><span><strong>Bahasa Indonesia</strong><small>Indonesia</small></span>${rc8Icon('check','sm')}</button><button class="btn primary entry-next" id="languageNext" type="button">Lanjutkan</button></section></main>`;
    $('#languageNext').onclick=()=>{writeEntry({language:'id'});languageConfirmView();};
  }
  function languageConfirmView(){
    root.innerHTML=`<main class="entry-shell"><section class="entry-card entry-rise"><div class="entry-logo small">${walletMark()}</div><div class="entry-eyebrow">Konfirmasi bahasa</div><h1>Bahasa Indonesia</h1><p class="entry-lead">SAKU akan menggunakan Bahasa Indonesia sebagai bahasa utama aplikasi pada versi ini.</p><div class="entry-summary">${rc8Icon('check')}<div><strong>Bahasa Indonesia</strong><small>Dapat digunakan untuk seluruh fitur SAKU.</small></div></div><div class="entry-actions"><button class="btn secondary" id="languageBack" type="button">Kembali</button><button class="btn primary" id="languageConfirm" type="button">Ya, gunakan</button></div></section></main>`;
    $('#languageBack').onclick=languageView;
    $('#languageConfirm').onclick=()=>{writeEntry({languageConfirmed:true,featureIndex:0});featureIntroView(0);};
  }
  const featureSlides=[
    {kind:'wallet',eyebrow:'Kelola usaha lebih mudah',title:'Semua yang penting, dalam satu SAKU',body:'Pantau aktivitas usaha dengan tampilan yang ringkas, jelas, dan siap digunakan setiap hari.'},
    {kind:'products',eyebrow:'Produk & stok',title:'Stok lebih terkontrol',body:'Kelola produk, harga, foto, dan stok agar operasional usaha tetap rapi dari satu tempat.'},
    {kind:'cashier',eyebrow:'Transaksi kasir',title:'Transaksi cepat dan praktis',body:'Proses pembayaran tunai maupun QRIS dengan alur kasir yang ringan dan mudah dipahami.'},
    {kind:'report',eyebrow:'Laporan usaha',title:'Pahami perkembangan usaha',body:'Lihat pendapatan, pengeluaran, laba, dan laporan usaha untuk membantu keputusan harian.'},
  ];
  function featureIntroView(index=0){
    const slide=featureSlides[Math.max(0,Math.min(featureSlides.length-1,index))];
    writeEntry({featureIndex:index});
    root.innerHTML=`<main class="entry-shell feature-entry"><section class="entry-card entry-rise"><div class="entry-progress">${featureSlides.map((_,i)=>`<i class="${i<=index?'active':''}"></i>`).join('')}</div><div class="feature-illustration">${launchIllustration(slide.kind)}</div><div class="entry-eyebrow">${esc(slide.eyebrow)}</div><h1>${esc(slide.title)}</h1><p class="entry-lead">${esc(slide.body)}</p><div class="entry-actions"><button class="btn secondary" id="featureBack" type="button">${index?'Kembali':'Lewati'}</button><button class="btn primary" id="featureNext" type="button">${index===featureSlides.length-1?'Mulai dengan SAKU':'Berikutnya'}</button></div></section></main>`;
    $('#featureBack').onclick=()=>index?featureIntroView(index-1):(writeEntry({preAuthComplete:true}),authView('login'));
    $('#featureNext').onclick=()=>{if(index<featureSlides.length-1)featureIntroView(index+1);else{writeEntry({preAuthComplete:true,featureIndex:featureSlides.length});authView('register');}};
  }
  function entryOrAuth(){
    const p=readEntry();
    if(p.preAuthComplete)return authView('login');
    if(!p.languageConfirmed)return p.language?languageConfirmView():languageView();
    return featureIntroView(Number(p.featureIndex||0));
  }
  async function routeAfterSession(){
    try{
      const ob=await request('/api/onboarding/state');
      state.onboarding=ob;
      if(ob?.status==='COMPLETED'){
        await loadAppData(); renderApp(); startEvents(); return;
      }
      renderOnboarding();
    }catch(err){
      // Onboarding and tenant provisioning are mandatory release gates.  An older
      // API must be upgraded; it must never be allowed to bypass this journey.
      onboardingNetworkView(err);
    }
  }
  function onboardingNetworkView(err){
    root.innerHTML=`<main class="entry-shell"><section class="entry-card entry-rise"><div class="entry-icon warning">${rc8Icon('alert')}</div><div class="entry-eyebrow">Koneksi terputus</div><h1>Data onboarding belum dapat dimuat</h1><p class="entry-lead">${esc(message(err))}. Data yang sudah tersimpan tidak akan hilang.</p><div class="entry-actions"><button class="btn secondary" id="networkLogout" type="button">Keluar</button><button class="btn primary" id="networkRetry" type="button">Coba lagi</button></div></section></main>`;
    $('#networkRetry').onclick=routeAfterSession;$('#networkLogout').onclick=logout;
  }
  async function saveOnboarding(step,data={},countryCode){
    const body={step,data};if(countryCode)body.countryCode=countryCode;
    const next=await request('/api/onboarding/state',{method:'PATCH',body:JSON.stringify(body)});
    state.onboarding=next;return next;
  }
  function onbPayload(){return state.onboarding?.payload||{};}
  function onbHeader(kicker,title,body){
    return `<div class="onb-top"><div class="entry-logo tiny">${walletMark()}</div><span>SAKU</span><b>${esc(kicker)}</b></div><div class="entry-eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p class="entry-lead">${esc(body)}</p>`;
  }
  function renderOnboarding(){
    const step=state.onboarding?.step||'country';
    if(step==='country')return countryView();
    if(step==='country-confirm')return countryConfirmView();
    if(step==='business')return businessDataView();
    if(step==='classification')return classificationView();
    if(step==='owner')return ownerDataView();
    if(step==='consent')return consentView();
    if(step==='provisioning')return provisioningView();
    return countryView();
  }
  function countryView(){
    root.innerHTML=`<main class="entry-shell"><section class="entry-card wide entry-rise">${onbHeader('Lokasi usaha','Pilih negara','Negara menentukan klasifikasi usaha resmi yang digunakan SAKU.')}<button class="choice-card selected" id="countryId" type="button"><span class="choice-flag">ID</span><span><strong>Indonesia</strong><small>KBLI 2025 · Badan Pusat Statistik</small></span>${rc8Icon('check','sm')}</button><p class="entry-note">SAKU saat ini menggunakan klasifikasi usaha resmi Indonesia.</p><button class="btn primary entry-next" id="countryNext" type="button">Lanjutkan</button></section></main>`;
    $('#countryNext').onclick=async()=>{const b=$('#countryNext');b.disabled=true;try{await saveOnboarding('country-confirm',{language:readEntry().language||'id'},'ID');renderOnboarding();}catch(e){toast(message(e));b.disabled=false;}};
  }
  function countryConfirmView(){
    root.innerHTML=`<main class="entry-shell"><section class="entry-card wide entry-rise">${onbHeader('Konfirmasi negara','Usaha Anda berada di Indonesia?','SAKU akan menggunakan KBLI 2025 sebagai klasifikasi aktivitas usaha.')}<div class="entry-summary">${rc8Icon('check')}<div><strong>Indonesia</strong><small>Klasifikasi canonical: KBLI 2025</small></div></div><div class="entry-actions"><button class="btn secondary" id="countryBack" type="button">Kembali</button><button class="btn primary" id="countryConfirm" type="button">Ya, benar</button></div></section></main>`;
    $('#countryBack').onclick=async()=>{await saveOnboarding('country',{},'ID');renderOnboarding();};
    $('#countryConfirm').onclick=async()=>{const b=$('#countryConfirm');b.disabled=true;try{await saveOnboarding('business',{},'ID');renderOnboarding();}catch(e){toast(message(e));b.disabled=false;}};
  }
  function businessDataView(){
    const b=onbPayload().business||{},m=state.merchant||{};
    root.innerHTML=`<main class="entry-shell"><section class="entry-card wide entry-rise">${onbHeader('Data usaha','Ceritakan usaha Anda','Lengkapi informasi dasar agar dashboard dan laporan menggunakan identitas usaha yang benar.')}<form id="onbBusiness"><div class="field"><label>Nama usaha</label><input name="name" required minlength="2" maxlength="160" value="${esc(b.name||m.name||'')}"></div><div class="field"><label>Nomor WhatsApp / telepon</label><input name="phoneNumber" inputmode="tel" maxlength="30" value="${esc(b.phoneNumber||m.phoneNumber||'')}"></div><div class="field"><label>Alamat usaha</label><textarea name="address" maxlength="500">${esc(b.address||m.address||'')}</textarea></div><div class="field"><label>Tentang usaha</label><textarea name="bio" maxlength="1000" placeholder="Contoh: warung makan keluarga, produk batik, jasa laundry...">${esc(b.bio||m.businessBio||'')}</textarea></div><div class="entry-actions"><button class="btn secondary" id="businessBack" type="button">Kembali</button><button class="btn primary" type="submit">Lanjutkan</button></div></form></section></main>`;
    $('#businessBack').onclick=async()=>{await saveOnboarding('country-confirm',{});renderOnboarding();};
    $('#onbBusiness').onsubmit=async e=>{e.preventDefault();const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;const fd=new FormData(e.currentTarget),business={name:String(fd.get('name')||'').trim(),phoneNumber:String(fd.get('phoneNumber')||'').trim()||null,address:String(fd.get('address')||'').trim()||null,bio:String(fd.get('bio')||'').trim()||null};try{await saveOnboarding('classification',{business});renderOnboarding();}catch(err){toast(message(err));btn.disabled=false;}};
  }
  const friendlyBusinessQueries=['angkringan','warmindo','kopi','batik','laundry','barbershop','homestay','toko kelontong','bakery','catering','bengkel','fotografi','software house','kriya','kerajinan','souvenir','fashion','event organizer','pertanian','peternakan'];
  async function runKbliSearch(q){
    const target=$('#kbliResults');if(!target)return;
    state.kbliQuery=String(q||'').trim();
    if(!state.kbliQuery){state.kbliResults=[];target.innerHTML='<div class="kbli-empty">Ketik nama usaha atau pilih salah satu contoh di atas.</div>';return;}
    target.innerHTML='<div class="kbli-loading"><span></span><span></span><span></span> Mencari klasifikasi resmi…</div>';
    try{const data=await request(`/api/reference/kbli/search?q=${encodeURIComponent(state.kbliQuery)}&region=DIY&limit=30`,{},false);state.kbliResults=data.results||[];renderKbliResults();}
    catch(e){target.innerHTML=`<div class="kbli-empty error">Pencarian belum tersedia. ${esc(message(e))}</div>`;}
  }
  function currentClassifications(){
    const p=onbPayload();
    const primary=p.primaryClassification||null,secondary=Array.isArray(p.secondaryClassifications)?p.secondaryClassifications:[];
    return {primary,secondary};
  }
  function renderSelectedClassifications(){
    const box=$('#kbliSelected');if(!box)return;
    const {primary,secondary}=currentClassifications();
    box.innerHTML=primary?`<div class="selected-kbli primary"><span>UTAMA</span><div><strong>${esc(primary.title||primary.code)}</strong><small>${esc(primary.code)}</small></div><button type="button" id="clearPrimary" aria-label="Hapus">${rc8Icon('close','sm')}</button></div>${secondary.map(x=>`<div class="selected-kbli"><span>LAINNYA</span><div><strong>${esc(x.title||x.code)}</strong><small>${esc(x.code)}</small></div><button type="button" data-remove-secondary="${esc(x.code)}" aria-label="Hapus">${rc8Icon('close','sm')}</button></div>`).join('')}`:'<div class="kbli-empty">Belum ada klasifikasi dipilih.</div>';
    const clear=$('#clearPrimary');if(clear)clear.onclick=()=>{const p=onbPayload();delete p.primaryClassification;state.onboarding.payload={...p};renderSelectedClassifications();renderKbliResults();};
    $$('[data-remove-secondary]').forEach(b=>b.onclick=()=>{const p=onbPayload();p.secondaryClassifications=(p.secondaryClassifications||[]).filter(x=>x.code!==b.dataset.removeSecondary);state.onboarding.payload={...p};renderSelectedClassifications();renderKbliResults();});
  }
  function setLocalClassification(row,mode){
    const p={...onbPayload()},item={code:row.code,title:row.title,alias:state.kbliQuery||undefined};
    p.secondaryClassifications=Array.isArray(p.secondaryClassifications)?[...p.secondaryClassifications]:[];
    if(mode==='primary'){
      if(p.primaryClassification?.code&&p.primaryClassification.code!==row.code&&!p.secondaryClassifications.some(x=>x.code===p.primaryClassification.code))p.secondaryClassifications.unshift(p.primaryClassification);
      p.primaryClassification=item;p.secondaryClassifications=p.secondaryClassifications.filter(x=>x.code!==row.code).slice(0,8);
    }else if(p.primaryClassification?.code!==row.code){
      if(p.secondaryClassifications.some(x=>x.code===row.code))p.secondaryClassifications=p.secondaryClassifications.filter(x=>x.code!==row.code);
      else if(p.secondaryClassifications.length<8)p.secondaryClassifications.push(item);else return toast('Maksimal 8 aktivitas usaha tambahan.');
    }
    state.onboarding.payload=p;renderSelectedClassifications();renderKbliResults();
  }
  function renderKbliResults(){
    const target=$('#kbliResults');if(!target)return;
    const {primary,secondary}=currentClassifications(),sec=new Set(secondary.map(x=>x.code));
    target.innerHTML=state.kbliResults.length?state.kbliResults.map(r=>`<article class="kbli-result"><div class="kbli-code">${esc(r.code)}</div><div class="kbli-copy"><strong>${esc(r.title)}</strong><small>${esc(r.description||'Klasifikasi resmi KBLI 2025')}</small></div><div class="kbli-actions"><button type="button" class="${primary?.code===r.code?'chosen':''}" data-kbli-primary="${esc(r.code)}">${primary?.code===r.code?'Utama':'Jadikan utama'}</button><button type="button" class="${sec.has(r.code)?'chosen':''}" data-kbli-secondary="${esc(r.code)}">${sec.has(r.code)?'Dipilih':'Tambah'}</button></div></article>`).join(''):`<div class="kbli-empty">Belum ada hasil. Coba istilah yang lebih umum atau gunakan pencarian luas di bawah.</div>`;
    $$('[data-kbli-primary]').forEach(b=>b.onclick=()=>{const r=state.kbliResults.find(x=>x.code===b.dataset.kbliPrimary);if(r)setLocalClassification(r,'primary');});
    $$('[data-kbli-secondary]').forEach(b=>b.onclick=()=>{const r=state.kbliResults.find(x=>x.code===b.dataset.kbliSecondary);if(r)setLocalClassification(r,'secondary');});
  }
  function classificationView(){
    const p=onbPayload();
    root.innerHTML=`<main class="entry-shell classification-entry"><section class="entry-card wide entry-rise">${onbHeader('Jenis usaha','Pilih aktivitas usaha','Cari dengan istilah sehari-hari. SAKU memetakan pilihan ke kode resmi KBLI 2025 tanpa mengubah kode canonical.')}<div class="friendly-query">${friendlyBusinessQueries.map(x=>`<button type="button" data-friendly="${esc(x)}">${esc(x)}</button>`).join('')}</div><div class="kbli-search"><span>${rc8Icon('search','sm')}</span><input id="kbliSearch" placeholder="Contoh: angkringan, batik, laundry…" value="${esc(state.kbliQuery||'')}"></div><div id="kbliResults"><div class="kbli-empty">Ketik nama usaha atau pilih contoh di atas.</div></div><button class="wide-search" id="wideKbliSearch" type="button">${rc8Icon('search','sm')} Usaha saya tidak ditemukan</button><div class="classification-label">Pilihan Anda</div><div id="kbliSelected"></div><div class="entry-actions sticky-actions"><button class="btn secondary" id="classBack" type="button">Kembali</button><button class="btn primary" id="classNext" type="button">Lanjutkan</button></div></section></main>`;
    renderSelectedClassifications();
    let t;$('#kbliSearch').oninput=e=>{clearTimeout(t);t=setTimeout(()=>runKbliSearch(e.target.value),260);};
    $$('[data-friendly]').forEach(b=>b.onclick=()=>{$('#kbliSearch').value=b.dataset.friendly;runKbliSearch(b.dataset.friendly);});
    $('#wideKbliSearch').onclick=()=>{toast('Gunakan kata yang lebih umum, misalnya makanan, perdagangan, jasa, produksi, atau aktivitas utama usaha Anda.');$('#kbliSearch').focus();};
    $('#classBack').onclick=async()=>{await saveOnboarding('business',{});renderOnboarding();};
    $('#classNext').onclick=async()=>{const {primary,secondary}=currentClassifications();if(!primary)return toast('Pilih satu klasifikasi utama terlebih dahulu.');const b=$('#classNext');b.disabled=true;try{await saveOnboarding('owner',{primaryClassification:{code:primary.code,alias:primary.alias},secondaryClassifications:secondary.map(x=>({code:x.code,alias:x.alias}))});renderOnboarding();}catch(e){toast(message(e));b.disabled=false;}};
    if(state.kbliQuery)runKbliSearch(state.kbliQuery);
  }
  function ownerDataView(){
    const p=onbPayload(),o=p.owner||{};
    root.innerHTML=`<main class="entry-shell"><section class="entry-card wide entry-rise">${onbHeader('Data pemilik','Siapa yang mengelola usaha ini?','Data pemilik digunakan sebagai identitas akun utama merchant.')}<form id="ownerForm"><div class="field"><label>Nama lengkap pemilik</label><input name="name" required minlength="2" maxlength="120" autocomplete="name" value="${esc(o.name||state.user?.name||'')}"></div><div class="field"><label>Email akun</label><input value="${esc(state.user?.email||'')}" disabled></div><div class="entry-actions"><button class="btn secondary" id="ownerBack" type="button">Kembali</button><button class="btn primary" type="submit">Lanjutkan</button></div></form></section></main>`;
    $('#ownerBack').onclick=async()=>{await saveOnboarding('classification',{});renderOnboarding();};
    $('#ownerForm').onsubmit=async e=>{e.preventDefault();const b=$('button[type=submit]',e.currentTarget);b.disabled=true;const name=String(new FormData(e.currentTarget).get('name')||'').trim();try{await saveOnboarding('consent',{owner:{name}});renderOnboarding();}catch(err){toast(message(err));b.disabled=false;}};
  }
  const legalDocs={
    terms:`<div class="legal-copy"><h4>Ketentuan Penggunaan SAKU</h4><p>SAKU membantu pengelolaan operasional UMKM. Pengguna bertanggung jawab atas kebenaran data usaha, transaksi, produk, harga, dan hak akses anggota tim yang dimasukkan ke aplikasi.</p><p>Akun wajib dijaga keamanannya dan tidak boleh digunakan untuk aktivitas melanggar hukum. SAKU dapat menerapkan pembatasan teknis yang wajar untuk menjaga stabilitas dan keamanan layanan.</p><p>Fitur laporan merupakan ringkasan operasional berdasarkan data yang dicatat di SAKU dan bukan pengganti nasihat akuntansi, perpajakan, atau audit independen.</p></div>`,
    privacy:`<div class="legal-copy"><h4>Kebijakan Privasi SAKU</h4><p>SAKU memproses data akun, identitas usaha, produk, transaksi, stok, laporan, perangkat, dan data lain yang diperlukan untuk menyediakan layanan.</p><p>Data digunakan untuk autentikasi, sinkronisasi, keamanan, fungsi operasional dan pemulihan layanan. Akses dibatasi berdasarkan akun, merchant, dan peran yang berlaku.</p><p>SAKU menerapkan penyimpanan dan transmisi yang dirancang untuk menjaga kerahasiaan data. Pengguna dapat mengelola informasi usaha melalui fitur profil dan pengaturan yang tersedia.</p></div>`
  };
  function showLegal(kind){sheet(kind==='privacy'?'Kebijakan Privasi':'Ketentuan Penggunaan',legalDocs[kind]||'');}
  function consentView(){
    root.innerHTML=`<main class="entry-shell"><section class="entry-card wide entry-rise">${onbHeader('Persetujuan','Satu langkah terakhir','Tinjau ketentuan dan privasi sebelum SAKU menyiapkan dashboard usaha Anda.')}<label class="consent-row"><input id="termsConsent" type="checkbox"><span><strong>Saya menyetujui Ketentuan Penggunaan</strong><small><button type="button" id="openTerms">Baca ketentuan</button></small></span></label><label class="consent-row"><input id="privacyConsent" type="checkbox"><span><strong>Saya menyetujui Kebijakan Privasi</strong><small><button type="button" id="openPrivacy">Baca kebijakan</button></small></span></label><div class="entry-actions"><button class="btn secondary" id="consentBack" type="button">Kembali</button><button class="btn primary" id="consentNext" type="button">Siapkan SAKU</button></div></section></main><div id="portal"></div>`;
    $('#openTerms').onclick=e=>{e.preventDefault();showLegal('terms');};$('#openPrivacy').onclick=e=>{e.preventDefault();showLegal('privacy');};
    $('#consentBack').onclick=async()=>{await saveOnboarding('owner',{});renderOnboarding();};
    $('#consentNext').onclick=async()=>{if(!$('#termsConsent').checked||!$('#privacyConsent').checked)return toast('Setujui ketentuan dan privasi untuk melanjutkan.');const b=$('#consentNext');b.disabled=true;try{await saveOnboarding('provisioning',{consents:{terms:true,privacy:true}});renderOnboarding();}catch(e){toast(message(e));b.disabled=false;}};
  }
  async function provisioningView(){
    root.innerHTML=`<main class="entry-shell provisioning"><section class="entry-card entry-rise"><div class="provision-mark">${walletMark()}<span></span></div><div class="entry-eyebrow">Menyiapkan SAKU</div><h1>Hampir selesai</h1><p class="entry-lead" id="provisionText">Menyimpan klasifikasi, profil, dan konfigurasi usaha Anda.</p><div class="provision-steps"><i class="active"></i><i></i><i></i></div><button class="btn secondary hidden" id="provisionRetry" type="button">Coba lagi</button></section></main>`;
    if(state.onboardingBusy)return;state.onboardingBusy=true;
    const p=onbPayload(),primary=p.primaryClassification,secondary=p.secondaryClassifications||[],business=p.business||{},owner=p.owner||{};
    try{
      const complete=await request('/api/onboarding/complete',{method:'POST',body:JSON.stringify({countryCode:state.onboarding?.countryCode||'ID',business:{name:business.name,phoneNumber:business.phoneNumber||null,address:business.address||null,bio:business.bio||null},owner:{name:owner.name||state.user?.name},primaryClassification:{code:primary.code,alias:primary.alias},secondaryClassifications:secondary.map(x=>({code:x.code,alias:x.alias})),consents:{terms:true,privacy:true}})});
      state.onboarding=complete;
      $$('.provision-steps i').forEach((x,i)=>setTimeout(()=>x.classList.add('active'),i*120));
      setTimeout(async()=>{await loadAppData();renderApp();startEvents();toast('SAKU siap digunakan.');},reducedMotion()?20:520);
    }catch(e){
      const text=$('#provisionText');if(text)text.textContent=`Belum dapat menyelesaikan proses: ${message(e)}. Data Anda tetap tersimpan.`;
      const r=$('#provisionRetry');if(r){r.classList.remove('hidden');r.onclick=()=>{state.onboardingBusy=false;provisioningView();};}
    }finally{state.onboardingBusy=false;}
  }

  async function saveRefresh(token){
    if (secure()?.save) return secure().save({refreshToken:token});
    sessionStorage.setItem('saku_preview_refresh',token);
  }
  async function loadRefresh(){
    if (secure()?.load) return (await secure().load()).refreshToken || null;
    return sessionStorage.getItem('saku_preview_refresh');
  }
  async function clearRefresh(){
    if (secure()?.clear) await secure().clear().catch(()=>{});
    sessionStorage.removeItem('saku_preview_refresh');
  }

  async function savePendingRevocation(token){if(secure()?.savePendingRevocation)return secure().savePendingRevocation({refreshToken:token});sessionStorage.setItem('saku_preview_pending_revocation',token);}
  async function loadPendingRevocation(){if(secure()?.loadPendingRevocation)return (await secure().loadPendingRevocation()).refreshToken||null;return sessionStorage.getItem('saku_preview_pending_revocation');}
  async function clearPendingRevocation(){if(secure()?.clearPendingRevocation)await secure().clearPendingRevocation().catch(()=>{});sessionStorage.removeItem('saku_preview_pending_revocation');}
  async function retryPendingRevocation(){const token=await loadPendingRevocation();if(!token)return;try{await request('/api/auth/logout',{method:'POST',body:JSON.stringify({refreshToken:token})},false);await clearPendingRevocation();}catch{}}
  async function readJsonBounded(res,max=1024*1024){const declared=Number(res.headers.get('content-length')||0);if(declared>max)throw new Error('RESPONSE_TOO_LARGE');if(!res.body)return{};const reader=res.body.getReader(),decoder=new TextDecoder();let text='',total=0;while(true){const{value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){reader.cancel().catch(()=>{});throw new Error('RESPONSE_TOO_LARGE');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();try{return text?JSON.parse(text):{};}catch{return{};}}

  async function request(path, options={}, retry=true){
    if(!apiConfigured()) throw new Error('API_BELUM_DIKONFIGURASI');
    const headers = {'Content-Type':'application/json',...(options.headers||{})};
    if(state.accessToken) headers.Authorization=`Bearer ${state.accessToken}`;
    const base=cfg.apiBaseUrl;
    const res = await fetch(`${base.replace(/\/$/,'')}${path}`, {...options,headers});
    const body=await readJsonBounded(res);
    if(res.status===401 && retry && state.accessToken){
      const ok=await refreshAccess();const method=String(options.method||'GET').toUpperCase();if(ok&&['GET','HEAD'].includes(method))return request(path,options,false);if(ok)throw Object.assign(new Error('AUTH_REFRESHED_RETRY_REQUIRED'),{status:409});
    }
    if(!res.ok || body.ok===false){ const e=new Error(body.error||`HTTP_${res.status}`); e.status=res.status; throw e; }
    return body.data ?? body;
  }

  async function refreshAccess(){
    if(state.refreshInFlight) return state.refreshInFlight;
    state.refreshInFlight=(async()=>{
      const token=await loadRefresh(); if(!token) return false;
      try{
        const data=await request('/api/auth/refresh',{method:'POST',body:JSON.stringify({refreshToken:token})},false);
        state.accessToken=data.accessToken; state.user=data.user; await saveRefresh(data.refreshToken); return true;
      }catch{ await clearRefresh(); state.accessToken=null; return false; }
      finally{state.refreshInFlight=null;}
    })();
    return state.refreshInFlight;
  }

  async function acceptSession(data){
    state.accessToken=data.accessToken; state.user=data.user; await saveRefresh(data.refreshToken);
    await routeAfterSession();
  }

  function authView(mode='login'){
    const register=mode==='register';
    root.innerHTML=`<main class="auth"><div class="authbox">
      <div class="brand"><div class="brandmark">${walletMark()}</div><h1>SAKU <span>UMKM</span></h1><p>Transaksi Mudah, Kreatif, Unggul.</p></div>
      ${!apiConfigured()?'<div class="status bad">Konfigurasi backend production belum terpasang pada build ini.</div>':''}
      <section class="card authcard"><h2>${register?'Buat akun usaha':'Masuk ke SAKU'}</h2><p class="sub">${register?'Mulai kelola usaha Anda dengan aman.':'Lanjutkan pengelolaan usaha Anda.'}</p>
      <form id="authForm">
        ${register?'<div class="field"><label>Nama pemilik</label><input name="name" required minlength="2" autocomplete="name"></div><div class="field"><label>Nama usaha</label><input name="businessName" required minlength="2"></div>':''}
        <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>Password</label><input name="password" type="password" required minlength="${register?12:1}" autocomplete="${register?'new-password':'current-password'}"></div>
        <button class="btn primary full" type="submit">${register?'Daftar & lanjutkan':'Masuk ke Sistem'}</button>
      </form>
      <div class="auth-divider" role="separator"><span>atau</span></div>
      <div class="social-entry" aria-label="Opsi masuk lainnya">
        <button class="btn social-auth google visual-only" type="button" disabled aria-disabled="true"><b>G</b><span>Lanjutkan dengan Google<small>Segera hadir</small></span></button>
        <button class="btn social-auth apple visual-only" type="button" disabled aria-disabled="true"><b aria-hidden="true"></b><span>Lanjutkan dengan Apple<small>Segera hadir</small></span></button>
      </div>
      <div class="switch">${register?'Sudah punya akun?':'Belum punya akun?'} <button class="link" id="modeBtn">${register?'Masuk':'Daftar gratis'}</button></div>
      </section></div></main>`;
    $('#modeBtn').onclick=()=>authView(register?'login':'register');
    $('#authForm').onsubmit=async e=>{
      e.preventDefault(); const fd=new FormData(e.currentTarget); const btn=$('button[type=submit]',e.currentTarget); btn.disabled=true;
      try{ const payload=Object.fromEntries(fd.entries()); const data=await request(register?'/api/auth/register':'/api/auth/login',{method:'POST',body:JSON.stringify(payload)},false); await acceptSession(data); }
      catch(err){toast(message(err));} finally{btn.disabled=false;}
    };
  }

  function message(err){
    const m=String(err?.message||err||'Terjadi kesalahan');
    const map={INVALID_REQUEST:'Data belum lengkap atau tidak valid.',UNAUTHORIZED:'Sesi tidak valid. Silakan masuk kembali.',AUTH_REFRESHED_RETRY_REQUIRED:'Sesi sudah diperbarui. Ulangi tindakan agar tidak terjadi data ganda.',INSUFFICIENT_STOCK:'Stok tidak mencukupi.',RESOURCE_CONFLICT:'Data sudah digunakan.',IDEMPOTENCY_CONFLICT:'Permintaan transaksi yang sama digunakan untuk isi keranjang berbeda.',STORAGE_QUOTA_EXCEEDED:'Kuota penyimpanan media telah penuh.',CURRENT_PASSWORD_INVALID:'Password saat ini tidak sesuai.',RATE_LIMITED:'Terlalu banyak percobaan. Coba lagi beberapa saat.',RESPONSE_TOO_LARGE:'Respons server terlalu besar dan dibatalkan demi keamanan.',IMAGE_TOO_LARGE:'Ukuran foto terlalu besar.',IMAGE_DIMENSIONS_TOO_LARGE:'Resolusi foto terlalu besar.',API_BELUM_DIKONFIGURASI:'Backend production belum dikonfigurasi pada build ini.'};
    return map[m]||m.replaceAll('_',' ');
  }

  async function loadAppData(){
    const [merchant,products,dashboard]=await Promise.all([request('/api/merchant/me'),request('/api/products'),request('/api/merchant/dashboard')]);
    state.merchant=merchant; state.products=products; state.dashboard=dashboard; state.prefs=null; loadPrefs();
    await hydrateImages();
    if(!merchant.businessCategory || merchant.businessCategory==='BELUM_DIISI') setTimeout(()=>profileSheet(true),60);
  }
  async function hydrateImages(){
    const targets=state.products.filter(p=>p.imageAssetId&&!state.imageUrls.has(p.imageAssetId));
    await Promise.all(targets.map(async p=>{try{const r=await request(`/api/media/${p.imageAssetId}/read`);state.imageUrls.set(p.imageAssetId,r.url);}catch{}}));
  }

  function layout(inner){
    const initials=(state.user?.name||'S').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase(); loadPrefs();
    const avatarContent=state.profilePhoto?`<img src="${state.profilePhoto}" alt="Foto profil">`:esc(initials);
    root.innerHTML=`<div class="screen app"><header class="topbar"><div class="top-brand"><div class="mini-logo">${walletMark()}</div><div class="brand-lines"><strong>SAKU</strong><small>${esc(state.merchant?.name||'UMKM Anda')}</small></div></div><button class="avatar-btn" id="profileBtn" aria-label="Profil">${avatarContent}</button></header><main class="content"><div class="page">${inner}</div></main><nav class="nav">
    ${[['dashboard','Dashboard'],['cashier','Kasir'],['products','Produk'],['report','Laporan']].map(([id,l])=>`<button data-page="${id}" class="${state.page===id?'active':''}">${navIcon(id)}<span>${l}</span></button>`).join('')}
    </nav></div><div id="portal"></div>`;
    $$('.nav button').forEach(b=>b.onclick=()=>{const next=b.dataset.page;if(next===state.page)return;state.page=next;renderApp();});
    $('#profileBtn').onclick=()=>profileMenuSheet();
  }

  function stopTopProductsAuto(){
    if(state.topProductsTimer){clearInterval(state.topProductsTimer);state.topProductsTimer=null;}
  }

  function renderApp(){
    if(!state.accessToken){stopTopProductsAuto();authView();return;}
    if(state.page!=='dashboard')stopTopProductsAuto();
    if(state.page==='dashboard') dashboardPage(); else if(state.page==='cashier') cashierPage(); else if(state.page==='products') productsPage(); else reportPage();
  }

  function dashboardPage(){
    stopTopProductsAuto();
    const d=state.dashboard||{},pr=loadPrefs(),net=Number(d.netProfit??(Number(d.revenue||0)-Number(d.cogs||0)-Number(d.expenses||0))),low=state.products.filter(p=>Number(p.stock)<=Math.max(1,Number(p.minStock||5))),r=(state.report&&state.report.period==='daily')?state.report:null,trend=r?.trend||[],mx=Math.max(1,...trend.map(x=>Number(x.amount||0))),payments=r?.payments||[],sales=state.productSales,topProducts=(sales?.topByQuantity||sales?.items||[]).slice(0,3),shouldLoadSales=!sales&&!state.productSalesLoading;
    if(shouldLoadSales)state.productSalesLoading=true;
    const topProductsSection=state.productSalesLoading&&!sales
      ?`<section class="card section top-products-section"><div class="section-title"><h3>3 Produk Terlaris</h3><small>Hari ini</small></div><div class="top-products-skeleton" aria-label="Memuat produk terlaris"><div></div><span></span><span></span><span></span></div></section>`
      :`<section class="card section top-products-section"><div class="section-title"><h3>3 Produk Terlaris</h3><small>${topProducts.length?`${topProducts.length} produk`:'Hari ini'}</small></div>${topProducts.length?`<div class="top-products-carousel" id="topProductsCarousel" aria-roledescription="carousel" aria-label="Produk terlaris hari ini"><div class="top-products-track" id="topProductsTrack">${topProducts.map((x,i)=>{const prod=state.products.find(p=>p.id===x.productId),img=x.imageAssetId?state.imageUrls.get(x.imageAssetId):(prod?.imageAssetId?state.imageUrls.get(prod.imageAssetId):null);return `<div class="top-product-slide" data-slide="${i}" aria-label="${i+1} dari ${topProducts.length}"><article class="top-product-card"><div class="top-product-rank">#${i+1}</div><div class="top-product-media">${img?`<img src="${esc(img)}" alt="${esc(x.name||prod?.name||'Produk')}">`:rc8Icon('box')}</div><div class="top-product-copy"><div class="top-product-label">Produk terlaris</div><h4>${esc(x.name||prod?.name||'Produk')}</h4><div class="top-product-stats"><div><span>Terjual</span><b>${Number(x.quantitySold||0)}</b></div><div><span>Penjualan</span><b>${rupiah(x.grossSales||0)}</b></div></div></div></article></div>`}).join('')}</div></div><div class="top-products-dots" id="topProductsDots" aria-label="Navigasi produk">${topProducts.map((_,i)=>`<button type="button" data-slide="${i}" class="${i===Math.min(state.topProductsIndex,topProducts.length-1)?'active':''}" aria-label="Tampilkan produk ${i+1}" aria-current="${i===Math.min(state.topProductsIndex,topProducts.length-1)?'true':'false'}"></button>`).join('')}</div>`:`<div class="empty top-products-empty"><div class="empty-icon">${rc8Icon('box')}</div><strong>Belum ada produk terlaris</strong><p>Produk akan tampil setelah transaksi penjualan tercatat hari ini.</p></div>`}</section>`;
    layout(`<div class="hero"><div><div class="kicker">Halo, ${esc((state.user?.name||'Pemilik').split(' ')[0])}</div><h2>Ringkasan hari ini</h2><p>Aktivitas ${esc(state.merchant?.name||'usaha Anda')} secara singkat.</p></div>${pr.lowStockAlert&&low.length?`<span class="chip warn">${rc8Icon('alert','sm')} ${low.length} stok menipis</span>`:`<span class="chip"><span class="dot"></span> Aktif</span>`}</div>
      <div class="metric-grid"><div class="metric"><div class="metric-head"><span class="label">Pendapatan</span><span class="metric-icon">${rc8Icon('wallet','sm')}</span></div><div class="value">${rupiah(d.revenue)}</div></div><div class="metric"><div class="metric-head"><span class="label">Transaksi</span><span class="metric-icon">${rc8Icon('receipt','sm')}</span></div><div class="value">${Number(d.transactions||0)}</div></div><div class="metric"><div class="metric-head"><span class="label">Pengeluaran</span><span class="metric-icon red dashboard-expense">${rc8Icon('expense','sm')}</span></div><div class="value">${rupiah(d.expenses)}</div></div><div class="metric"><div class="metric-head"><span class="label">Laba Bersih</span><span class="metric-icon warn dashboard-profit">${rc8Icon('trend','sm')}</span></div><div class="value">${rupiah(net)}</div></div></div>
      ${topProductsSection}
      <section class="card section"><div class="section-title"><h3>Tren penjualan</h3><small>24 jam WIB</small></div>${trend.length?`<div class="bars">${trend.map(x=>`<div class="barwrap"><div class="bar" style="height:${Math.max(3,Math.round(Number(x.amount||0)/mx*104))}px"></div><span>${esc(x.label)}</span></div>`).join('')}</div>`:`<div class="empty"><div class="empty-icon">${rc8Icon('chart')}</div><strong>Belum ada tren penjualan</strong><p>Grafik 24 jam akan terbentuk otomatis setelah transaksi pertama.</p></div>`}</section>
      <section class="card section"><div class="section-title"><h3>Metode pembayaran</h3><small>${Number(d.transactions||0)} transaksi</small></div>${payments.length?`<div class="payrow">${payments.slice(0,2).map(x=>`<div class="paypill"><div class="row">${x.method==='CASH'?rc8Icon('cash','sm'):rc8Icon('qr','sm')} ${x.method==='CASH'?'Tunai':'QRIS'}</div><b>${rupiah(x.amount)}</b></div>`).join('')}</div>`:`<div class="empty"><div class="empty-icon">${rc8Icon('wallet')}</div><strong>Belum ada data</strong><p>Lakukan transaksi pertama melalui menu Kasir.</p></div>`}</section>`);
    if(topProducts.length) mountTopProductsCarousel(topProducts.length);
    if(!r){request('/api/merchant/report?period=daily').then(x=>{if(state.page==='dashboard'){state.report={...x,period:'daily'};dashboardPage();}}).catch(()=>{});}
    if(shouldLoadSales){
      request('/api/analytics/product-sales?period=daily').then(x=>{state.productSales=x||{items:[],topByQuantity:[]};}).catch(()=>{state.productSales={items:[],topByQuantity:[],unavailable:true};}).finally(()=>{state.productSalesLoading=false;if(state.page==='dashboard')dashboardPage();});
    }
  }

  function mountTopProductsCarousel(count){
    const viewport=$('#topProductsCarousel'),track=$('#topProductsTrack'),dots=$$('#topProductsDots button');
    if(!viewport||!track||count<1)return;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
    let index=Math.max(0,Math.min(count-1,Number(state.topProductsIndex||0))),startX=null;
    const paint=()=>{state.topProductsIndex=index;track.style.transform=`translate3d(-${index*100}%,0,0)`;track.querySelectorAll('.top-product-slide').forEach((el,i)=>el.setAttribute('aria-hidden',i===index?'false':'true'));dots.forEach((d,i)=>{d.classList.toggle('active',i===index);d.setAttribute('aria-current',i===index?'true':'false');});};
    const restart=()=>{stopTopProductsAuto();if(count>1&&!reduced){state.topProductsTimer=setInterval(()=>{index=(index+1)%count;paint();},4000);}};
    const go=i=>{index=(i+count)%count;paint();restart();};
    dots.forEach(d=>d.onclick=()=>go(Number(d.dataset.slide||0)));
    viewport.addEventListener('pointerdown',e=>{startX=e.clientX;stopTopProductsAuto();},{passive:true});
    viewport.addEventListener('pointerup',e=>{if(startX===null){restart();return;}const dx=e.clientX-startX;startX=null;if(Math.abs(dx)>42)index=dx<0?(index+1)%count:(index-1+count)%count;paint();restart();},{passive:true});
    viewport.addEventListener('pointercancel',()=>{startX=null;restart();},{passive:true});
    viewport.addEventListener('mouseenter',stopTopProductsAuto);
    viewport.addEventListener('mouseleave',restart);
    paint();restart();
  }

  function pCard(p,clickable=false){
    const img=p.imageAssetId?state.imageUrls.get(p.imageAssetId):null,low=loadPrefs().lowStockAlert&&Number(p.stock)<=Number(p.minStock||5);
    return `<article class="product" data-id="${esc(p.id)}"><div class="product-photo">${img?`<img src="${esc(img)}" alt="${esc(p.name)}">`:rc8Icon('box')}</div>${clickable?'':`<div class="product-top">${low?'<span class="chip warn">Stok rendah</span>':'<span></span>'}</div>`}<div class="pname">${esc(p.name)}</div>${clickable?`<div class="pcat">Stok ${Number(p.stock)}</div>`:''}<div class="price">${rupiah(p.sellPrice)}</div>${clickable?'':`<div class="stock ${low?'low':''}">Stok ${Number(p.stock)} · HPP ${rupiah(p.buyPrice)}</div><div class="actions"><button class="smallbtn edit">${rc8Icon('edit','sm')} Edit</button></div>`}</article>`;
  }

  function productsPage(){
    const q=String(state.productSearch||'').toLowerCase(),items=state.products.filter(p=>String(p.name||'').toLowerCase().includes(q));
    layout(`<div class="hero"><div><div class="kicker">Katalog</div><h2>Kelola produk</h2><p>${state.products.length} produk tersimpan</p></div><button class="fab" id="addProduct">${rc8Icon('plus','sm')} Tambah</button></div><div class="search-wrap">${rc8Icon('search')}<input class="search" id="productSearch" placeholder="Cari nama produk..." value="${esc(state.productSearch||'')}"></div>${items.length?`<div class="product-list">${items.map(p=>pCard(p)).join('')}</div>`:`<section class="card empty"><div class="empty-icon">${rc8Icon('box')}</div><strong>Belum ada produk</strong><p>Tambahkan produk pertama agar dapat langsung digunakan di Kasir.</p></section>`}`);
    $('#addProduct').onclick=()=>productSheet();
    $('#productSearch').oninput=e=>{state.productSearch=e.target.value;productsPage();};
    $$('.product .edit').forEach(b=>b.onclick=e=>productSheet(state.products.find(p=>p.id===e.target.closest('.product').dataset.id)));
  }

  function productSheet(p=null){
    let selectedFile=null;
    const currentImg=p?.imageAssetId?state.imageUrls.get(p.imageAssetId):null;
    sheet(p?'Edit produk':'Tambah produk',`<form id="productForm">
      <div class="field"><label>Foto produk ${p?'':'(wajib)'}</label>
        <div class="photo-picker">
          <div class="photo-preview" id="productPhotoPreview">${currentImg?`<img src="${esc(currentImg)}" alt="">`:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2Z"/><circle cx="12" cy="13" r="3"/></svg>'}</div>
          <div class="photo-actions">
            <label for="productPhotoInput">${currentImg?'Ganti foto':'Pilih foto'}</label>
            <input id="productPhotoInput" type="file" accept="image/jpeg,image/png,image/webp,image/avif" class="hidden">
            <small>${p?'Biarkan kosong jika foto tidak diubah.':'Foto wajib dipilih sebelum produk disimpan.'}</small>
          </div>
        </div>
      </div>
      <div class="field"><label>Nama produk</label><input name="name" required maxlength="120" value="${esc(p?.name||'')}"></div>
      <div class="grid2"><div class="field"><label>Harga beli</label><input name="buyPrice" type="number" min="0" required value="${esc(p?.buyPrice||0)}"></div><div class="field"><label>Harga jual</label><input name="sellPrice" type="number" min="0" required value="${esc(p?.sellPrice||0)}"></div></div>
      <div class="grid2"><div class="field"><label>Stok</label><input name="stock" type="number" min="0" required value="${esc(p?.stock||0)}"></div><div class="field"><label>Batas stok rendah</label><input name="minStock" type="number" min="0" required value="${esc(p?.minStock||5)}"></div></div>
      <div class="sheetactions"><button class="btn secondary" type="button" data-close>Batal</button><button class="btn primary" type="submit">Simpan</button></div>
      ${p?'<button class="btn danger full" style="margin-top:9px" type="button" id="deleteProduct">Nonaktifkan produk</button>':''}
    </form>`);

    const input=$('#productPhotoInput'),preview=$('#productPhotoPreview');
    input.onchange=e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>6*1024*1024){input.value='';return toast('Foto maksimal 6 MB');}
      selectedFile=file;
      const url=URL.createObjectURL(file);
      preview.innerHTML=`<img src="${url}" alt="Preview foto produk">`;
    };

    $('#productForm').onsubmit=async e=>{
      e.preventDefault();
      if(!p&&!selectedFile)return toast('Foto produk wajib dipilih');
      const submit=$('button[type=submit]',e.currentTarget);submit.disabled=true;
      const data=Object.fromEntries(new FormData(e.currentTarget).entries());
      for(const k of ['buyPrice','sellPrice','stock','minStock'])data[k]=Number(data[k]);
      try{
        if(p){
          await request(`/api/products/${p.id}`,{method:'PATCH',body:JSON.stringify(data)});
          if(selectedFile)await uploadProductPhoto(p.id,selectedFile);
        }else{
          const created=await request('/api/products',{method:'POST',body:JSON.stringify(data)});
          try{await uploadProductPhoto(created.id,selectedFile);}
          catch(uploadErr){await request(`/api/products/${created.id}`,{method:'DELETE'}).catch(()=>{});throw uploadErr;}
        }
        await reloadProducts();closeSheet();productsPage();toast(p?'Produk diperbarui':'Produk berhasil ditambahkan');
      }catch(err){toast(message(err));}
      finally{submit.disabled=false;}
    };
    if(p) $('#deleteProduct').onclick=async()=>{try{await request(`/api/products/${p.id}`,{method:'DELETE'});await reloadProducts();closeSheet();productsPage();toast('Produk dinonaktifkan');}catch(e){toast(message(e));}};
  }
  async function reloadProducts(){state.products=await request('/api/products');state.imageUrls.clear();hydrateImages().then(()=>{if(['products','cashier'].includes(state.page))renderApp();}).catch(()=>{});}

  async function uploadProductPhoto(productId,file){
    const blob=await optimizeImage(file);
    const dataBase64=await blobToBase64(blob);
    await request(`/api/media/product/${productId}/upload-inline`,{method:'POST',body:JSON.stringify({contentType:blob.type,dataBase64})});
  }
  async function blobToBase64(blob){
    const buf=await blob.arrayBuffer();
    let binary='';const bytes=new Uint8Array(buf),chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    return btoa(binary);
  }

  async function optimizeImage(file){
    if(file.size>6*1024*1024)throw new Error('Foto maksimal 6 MB');
    if(file.type==='image/avif' && file.size<2*1024*1024)return file;
    const bmp=await createImageBitmap(file);if(bmp.width*bmp.height>80000000){bmp.close?.();throw new Error('IMAGE_DIMENSIONS_TOO_LARGE');}const max=1280,scale=Math.min(1,max/Math.max(bmp.width,bmp.height)); const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bmp.width*scale));c.height=Math.max(1,Math.round(bmp.height*scale));c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close?.(); return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('IMAGE_PROCESS_FAILED')),'image/jpeg',.82));
  }

  function cashierPage(){
    const lines=[...state.cart.entries()].map(([id,q])=>({p:state.products.find(x=>x.id===id),q})).filter(x=>x.p),items=state.products.filter(p=>Number(p.stock)>0),total=lines.reduce((a,x)=>a+Number(x.p.sellPrice)*x.q,0);
    layout(`<div class="hero"><div><div class="kicker">Point of Sale</div><h2>Kasir digital</h2><p>Pilih produk lalu selesaikan pembayaran.</p></div><span class="chip">${items.length} tersedia</span></div><div class="cash-layout"><div>${items.length?`<div class="catalog">${items.map(p=>pCard(p,true)).join('')}</div>`:`<section class="card empty"><div class="empty-icon">${rc8Icon('box')}</div><strong>Belum ada produk siap jual</strong><p>Tambah produk atau isi stok dari menu Produk terlebih dahulu.</p></section>`}</div><aside class="card cart"><div class="cart-header"><h3>Keranjang</h3><span class="cart-count">${lines.reduce((a,x)=>a+x.q,0)} ITEM</span></div>${lines.length?lines.map(x=>`<div class="cart-row"><div class="row" style="gap:9px"><div class="cart-thumb">${x.p.imageAssetId&&state.imageUrls.get(x.p.imageAssetId)?`<img src="${esc(state.imageUrls.get(x.p.imageAssetId))}">`:rc8Icon('box','sm')}</div><div><strong>${esc(x.p.name)}</strong><small>${rupiah(x.p.sellPrice)} × ${x.q}</small></div></div><div class="qty"><button data-dec="${x.p.id}">−</button><b>${x.q}</b><button data-inc="${x.p.id}">+</button></div></div>`).join(''):`<div class="empty"><div class="empty-icon">${rc8Icon('cart')}</div><strong>Keranjang kosong</strong><p>Tap produk untuk menambahkannya.</p></div>`}<div class="payment"><button data-pay="CASH" class="${state.paymentMethod==='CASH'?'selected':''}">${rc8Icon('cash','sm')} Tunai</button><button data-pay="QRIS" class="${state.paymentMethod==='QRIS'?'selected':''}">${rc8Icon('qr','sm')} QRIS</button></div><div class="total"><span>TOTAL PEMBAYARAN</span><b>${rupiah(total)}</b></div><button class="btn primary" id="checkout" ${!lines.length?'disabled':''}>${rc8Icon('check','sm')} Konfirmasi bayar</button></aside></div>`);
    $$('.catalog .product').forEach(el=>el.onclick=()=>{const p=state.products.find(x=>x.id===el.dataset.id),q=state.cart.get(p.id)||0;if(q>=Number(p.stock))return toast('Stok tidak mencukupi');state.cart.set(p.id,q+1);cashierPage();});
    $$('[data-inc]').forEach(b=>b.onclick=()=>{const p=state.products.find(x=>x.id===b.dataset.inc),q=state.cart.get(p.id)||0;if(q>=Number(p.stock))return toast('Stok tidak mencukupi');state.cart.set(p.id,q+1);cashierPage();});
    $$('[data-dec]').forEach(b=>b.onclick=()=>{const id=b.dataset.dec,q=state.cart.get(id)||0;if(q<=1)state.cart.delete(id);else state.cart.set(id,q-1);cashierPage();});
    $$('[data-pay]').forEach(b=>b.onclick=()=>{state.paymentMethod=b.dataset.pay;cashierPage();});
    $('#checkout').onclick=async()=>{if(loadPrefs().confirmPayment&&!confirm(`Konfirmasi pembayaran ${rupiah(total)} melalui ${state.paymentMethod==='CASH'?'Tunai':'QRIS'}?`))return;const b=$('#checkout');b.disabled=true;const payload={idempotencyKey:uid(),paymentMethod:state.paymentMethod,items:lines.map(x=>({productId:x.p.id,quantity:x.q}))};try{const r=await request('/api/checkout',{method:'POST',body:JSON.stringify(payload)});state.cart.clear();await Promise.all([reloadProducts(),request('/api/merchant/dashboard').then(x=>state.dashboard=x)]);toast(`Transaksi ${r.invoiceNumber} berhasil`);cashierPage();}catch(e){toast(message(e));b.disabled=false;}};
  }

  function reportPage(){
    const r=(state.report&&state.report.period===state.period)?state.report:{};
    const trend=r.trend||[],max=Math.max(1,...trend.map(x=>Number(x.amount||0)));
    layout(`<div class="hero"><div><h2>Laporan & Analisis</h2><p>Pendapatan − HPP − Pengeluaran = Laba Bersih.</p></div><button class="fab" id="exportReport" ${state.report?'':'disabled'}>PDF</button></div>${!state.report?'<div class="status">Memuat laporan…</div>':''}<div class="periods">${[['daily','Harian'],['weekly','Mingguan'],['monthly','Bulanan'],['yearly','Tahunan']].map(([v,l])=>`<button data-period="${v}" class="${state.period===v?'active':''}">${l}</button>`).join('')}</div><div class="grid2" style="margin-top:10px"><div class="metric"><small>Pendapatan</small><b>${rupiah(r.revenue)}</b></div><div class="metric"><small>HPP</small><b>${rupiah(r.cogs)}</b></div><div class="metric"><small>Pengeluaran</small><b>${rupiah(r.expenses)}</b></div><div class="metric"><small>Laba Bersih</small><b>${rupiah(r.netProfit)}</b></div></div>${trend.length?`<section class="card section"><div class="sectionhead"><h3>Tren 24 Jam WIB</h3><small>8 interval</small></div><div class="bars">${trend.map(x=>`<div class="barcol"><div class="bar" style="height:${Math.max(3,Math.round(Number(x.amount||0)/max*120))}px"></div><span>${esc(x.label)}</span></div>`).join('')}</div></section>`:''}<section class="card section"><div class="sectionhead"><h3>Metode Pembayaran</h3></div>${(r.payments||[]).length?(r.payments||[]).map(x=>`<div class="row expense"><span>${esc(x.method)}</span><b>${rupiah(x.amount)}</b></div>`).join(''):'<div class="empty">Belum ada transaksi pada periode ini.</div>'}</section><section class="card section"><div class="sectionhead"><h3>Pengeluaran</h3><button class="fab" id="addExpense">+ Catat</button></div><div id="expensesBox">${renderExpenses()}</div></section>`);
    $$('[data-period]').forEach(b=>b.onclick=()=>{if(state.period===b.dataset.period)return;state.period=b.dataset.period;state.report=null;reportPage();ensureReport();});
    $('#addExpense').onclick=()=>expenseSheet(); $('#exportReport').onclick=()=>state.report&&exportReport(state.report);
    ensureReport(); ensureExpenses();
  }
  function renderExpenses(){const rows=state.expenses;if(!rows)return '<div class="empty">Memuat...</div>';return rows.length?rows.slice(0,40).map(e=>`<div class="row expense"><div><b style="font-size:10px">${esc(e.description||e.category)}</b><small>${esc(e.category)}</small></div><b>${rupiah(e.amount)}</b></div>`).join(''):'<div class="empty">Belum ada pengeluaran.</div>';}
  async function ensureReport(){if(state.reportLoading||(state.report&&state.report.period===state.period))return;const period=state.period;state.reportLoading=true;try{const r=await request(`/api/merchant/report?period=${period}`);if(state.period===period){state.report=r;if(state.page==='report')reportPage();}}catch(e){if(state.page==='report')toast(message(e));}finally{state.reportLoading=false;}}
  async function ensureExpenses(){if(state.expensesLoading||state.expenses)return;state.expensesLoading=true;try{state.expenses=await request('/api/merchant/expenses');const box=$('#expensesBox');if(box)box.innerHTML=renderExpenses();}catch(e){if(state.page==='report')toast(message(e));}finally{state.expensesLoading=false;}}
  function expenseSheet(){sheet('Catat Pengeluaran',`<form id="expenseForm"><div class="field"><label>Keterangan</label><input name="description" maxlength="500"></div><div class="field"><label>Kategori</label><input name="category" value="Operasional" required maxlength="80"></div><div class="field"><label>Nominal</label><input name="amount" type="number" min="1" required></div><div class="sheetactions"><button class="btn secondary" type="button" data-close>Batal</button><button class="btn primary">Simpan</button></div></form>`);$('#expenseForm').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.currentTarget).entries());o.amount=Number(o.amount);try{await request('/api/merchant/expenses',{method:'POST',body:JSON.stringify(o)});state.report=null;state.expenses=null;closeSheet();reportPage();toast('Pengeluaran tercatat');}catch(err){toast(message(err));}};}
  async function exportReport(r){
    if(reportExport()?.export){try{const out=await reportExport().export({businessName:state.merchant?.name||'SAKU UMKM',period:state.period,summary:{revenue:Number(r.revenue||0),cogs:Number(r.cogs||0),grossProfit:Number(r.grossProfit||0),expenses:Number(r.expenses||0),netProfit:Number(r.netProfit||0),transactions:Number(r.transactions||0)},payments:r.payments||[],trend:r.trend||[]});toast(`PDF tersimpan: ${out.filename}`);return;}catch(e){toast(message(e));return;}}
    toast('Export PDF tersedia pada aplikasi Android production.');
  }

  function profileMenuSheet(){
    const p=$('#portal')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'portal'}));
    const initials=(state.user?.name||'S').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
    p.innerHTML=`<div class="profile-overlay" id="menuOverlay"></div><div class="profile-menu" id="profileMenu"><div class="profile-menu-head"><strong>${esc(state.user?.name||'Pemilik')}</strong><small>${esc(state.merchant?.name||'UMKM Anda')} · ${esc(state.user?.email||'')}</small></div><button class="menu-btn" id="myProfile">${rc8Icon('user','sm')} Profil saya</button><button class="menu-btn" id="settingsBtn">${rc8Icon('settings','sm')} Pengaturan</button><button class="menu-btn danger" id="logout">${rc8Icon('logout','sm')} Keluar</button></div>`;
    $('#menuOverlay').onclick=closeSheet;$('#myProfile').onclick=()=>profileSheet(false);$('#settingsBtn').onclick=settingsSheet;$('#logout').onclick=logout;
  }

  function profileSheet(force){
    const m=state.merchant||{},pr=loadPrefs(),initials=(state.user?.name||'S').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
    sheet(force?'Lengkapi Profil Usaha':'Profil & usaha',`<div class="avatar-large" id="avatarLarge">${state.profilePhoto?`<img src="${state.profilePhoto}">`:esc(initials)}<label class="avatar-edit" for="profilePhotoInput">${rc8Icon('camera','sm')}</label><input id="profilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"></div><form id="profileForm"><div class="field"><label>Nama pemilik</label><input name="ownerName" required minlength="2" maxlength="120" value="${esc(state.user?.name||m.ownerName||'')}"></div><div class="field"><label>Email</label><input value="${esc(state.user?.email||m.email||'')}" disabled></div><div class="field"><label>Nomor telepon</label><input name="phoneNumber" maxlength="30" value="${esc(m.phoneNumber||'')}"></div><div class="field"><label>Nama usaha</label><input name="name" required minlength="2" maxlength="160" value="${esc(m.name||'')}"></div><div class="field"><label>Kategori usaha</label><select name="businessCategory"><option>Makanan & Minuman</option><option>Retail</option><option>Fashion</option><option>Jasa</option><option>Kecantikan</option><option>Kerajinan</option><option>Lainnya</option></select></div><div class="field"><label>Produk yang dijual</label><textarea name="productsSold" maxlength="180">${esc(pr.productsSold||'')}</textarea></div><div class="field"><label>Bio singkat usaha</label><textarea name="businessBio" maxlength="1000">${esc(m.businessBio||'')}</textarea></div><div class="field"><label>WhatsApp usaha</label><input name="businessWhatsapp" maxlength="30" value="${esc(pr.businessWhatsapp||m.phoneNumber||'')}"></div><div class="field"><label>Kota / Kabupaten</label><input name="city" maxlength="100" value="${esc(pr.city||'')}"></div><div class="field"><label>Alamat</label><textarea name="address" maxlength="500">${esc(m.address||'')}</textarea></div><button class="btn primary" type="submit">${rc8Icon('check','sm')} Simpan profil</button></form>`,force);
    const sel=$('[name=businessCategory]');if([...sel.options].some(x=>x.value===m.businessCategory))sel.value=m.businessCategory;
    $('#profilePhotoInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{await saveProfilePhoto(f);const a=$('#avatarLarge');if(a)a.innerHTML=`<img src="${state.profilePhoto}"><label class="avatar-edit" for="profilePhotoInput">${rc8Icon('camera','sm')}</label><input id="profilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden">`;toast('Foto profil diperbarui');}catch(err){toast(message(err));}};
    $('#profileForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),ownerName=String(fd.get('ownerName')||'').trim(),business={name:fd.get('name'),businessCategory:fd.get('businessCategory'),phoneNumber:fd.get('phoneNumber')||null,address:fd.get('address')||null,businessBio:fd.get('businessBio')||null},btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;try{await request('/api/merchant/me',{method:'PATCH',body:JSON.stringify(business)});if(ownerName&&ownerName!==state.user?.name){await request(`/api/team/users/${state.user.id}`,{method:'PATCH',body:JSON.stringify({name:ownerName})});state.user={...state.user,name:ownerName};}savePrefs({productsSold:String(fd.get('productsSold')||''),businessWhatsapp:String(fd.get('businessWhatsapp')||''),city:String(fd.get('city')||'')});state.merchant=await request('/api/merchant/me');closeSheet();renderApp();toast('Profil diperbarui');}catch(err){toast(message(err));}finally{btn.disabled=false;}};
  }

  function settingsSheet(){
    const pr=loadPrefs();
    sheet('Pengaturan',`<div class="settings-group"><h4>Akun & keamanan</h4><div class="setting-row" id="changePwd"><div class="setting-info"><div class="sicon">${rc8Icon('lock','sm')}</div><div><strong>Ubah password</strong><small>Perbarui password akun merchant.</small></div></div>${rc8Icon('chev','sm')}</div></div><div class="settings-group"><h4>Tampilan</h4><div class="setting-row"><div class="setting-info"><div class="sicon">${rc8Icon('settings','sm')}</div><div><strong>Mode gelap</strong><small>Gunakan tampilan gelap di seluruh aplikasi SAKU.</small></div></div><button class="toggle ${currentTheme==='dark'?'on':''}" id="themeToggle"></button></div></div><div class="settings-group"><h4>Preferensi kasir</h4><div class="setting-row"><div class="setting-info"><div class="sicon">${rc8Icon('check','sm')}</div><div><strong>Konfirmasi pembayaran</strong><small>Minta konfirmasi sebelum transaksi disimpan.</small></div></div><button class="toggle ${pr.confirmPayment?'on':''}" id="prefConfirm"></button></div><div class="setting-row"><div class="setting-info"><div class="sicon">${rc8Icon('bell','sm')}</div><div><strong>Peringatan stok rendah</strong><small>Tampilkan indikator ketika stok mendekati batas minimum.</small></div></div><button class="toggle ${pr.lowStockAlert?'on':''}" id="prefStock"></button></div></div><div class="settings-group"><h4>Struk</h4><div class="setting-row"><div class="setting-info"><div class="sicon">${rc8Icon('phone','sm')}</div><div><strong>Tampilkan kontak usaha</strong><small>Tampilkan kontak pada informasi struk.</small></div></div><button class="toggle ${pr.receiptContact?'on':''}" id="prefReceiptContact"></button></div><div class="setting-row" id="receiptFooter"><div class="setting-info"><div class="sicon">${rc8Icon('receipt','sm')}</div><div><strong>Catatan struk</strong><small>${esc(pr.receiptNote||'Belum diatur')}</small></div></div>${rc8Icon('chev','sm')}</div></div><div class="settings-group"><h4>Data</h4><div class="setting-row" id="exportDevice"><div class="setting-info"><div class="sicon">${rc8Icon('download','sm')}</div><div><strong>Export data perangkat</strong><small>Simpan salinan JSON pengaturan perangkat.</small></div></div>${rc8Icon('chev','sm')}</div></div><div class="settings-group"><h4>Aplikasi</h4><div class="setting-row" id="aboutSaku"><div class="setting-info"><div class="sicon">${rc8Icon('info','sm')}</div><div><strong>Tentang SAKU</strong><small>Transaksi UMKM Kreatif Unggul.</small></div></div>${rc8Icon('chev','sm')}</div></div>`);
    $('#themeToggle').onclick=async()=>{await setTheme(currentTheme==='dark'?'light':'dark');settingsSheet();};$('#changePwd').onclick=passwordSheet;
    const toggle=(id,key)=>{$('#'+id).onclick=()=>{const p=loadPrefs(),v=!p[key];savePrefs({[key]:v});$('#'+id).classList.toggle('on',v);toast('Pengaturan diperbarui');};};toggle('prefConfirm','confirmPayment');toggle('prefStock','lowStockAlert');toggle('prefReceiptContact','receiptContact');
    $('#receiptFooter').onclick=()=>{sheet('Catatan struk',`<form id="receiptForm"><div class="field"><label>Pesan penutup</label><textarea id="receiptNote" maxlength="250">${esc(loadPrefs().receiptNote||'')}</textarea></div><button class="btn primary" type="submit">${rc8Icon('check','sm')} Simpan</button></form>`);const f=$('#receiptForm');if(f)f.onsubmit=e=>{e.preventDefault();savePrefs({receiptNote:$('#receiptNote').value.trim()});closeSheet();toast('Catatan struk diperbarui');};};
    $('#exportDevice').onclick=()=>{const data={merchant:{id:state.merchant?.id,name:state.merchant?.name},user:{name:state.user?.name,email:state.user?.email},preferences:loadPrefs(),exportedAt:new Date().toISOString()},blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='SAKU-pengaturan-perangkat.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Data perangkat diekspor');};
    $('#aboutSaku').onclick=()=>sheet('Tentang SAKU','<div class="about-box"><strong>SAKU — Transaksi UMKM Kreatif Unggul</strong><p>Transaksi Mudah, Kreatif, Unggul.</p></div>');
  }

  function passwordSheet(){sheet('Ubah Password',`<form id="pwd"><div class="field"><label>Password saat ini</label><input name="currentPassword" type="password" required></div><div class="field"><label>Password baru</label><input name="newPassword" type="password" required minlength="12"></div><button class="btn primary full">Ubah Password</button></form>`);$('#pwd').onsubmit=async e=>{e.preventDefault();try{await request('/api/merchant/change-password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget).entries()))});closeSheet();toast('Password diperbarui; sesi perangkat lain dicabut.');}catch(err){toast(message(err));}};}
  async function logout(){
    const ref=await loadRefresh();let revoked=!ref;try{if(ref){await request('/api/auth/logout',{method:'POST',body:JSON.stringify({refreshToken:ref})},false);revoked=true;}}catch{if(ref)await savePendingRevocation(ref);}if(revoked)await clearPendingRevocation();await clearRefresh();state.accessToken=null;state.user=null;state.eventSource?.close();if(google()?.signOut)await google().signOut().catch(()=>{});authView();if(!revoked)toast('Keluar lokal berhasil. Pencabutan sesi server akan dicoba kembali.');
  }

  function sheet(title,html,locked=false){
    let p=$('#portal');if(!p){p=document.createElement('div');p.id='portal';document.body.appendChild(p);}p.innerHTML=`<div class="overlay" id="sheetOverlay"></div><div class="sheet-wrap"><section class="sheet"><div class="grab"></div><div class="sheet-head"><h3>${title}</h3>${locked?'':`<button class="sheet-close" id="sheetClose">${rc8Icon('close','sm')}</button>`}</div>${html}</section></div>`;
    if(!locked){$('#sheetOverlay').onclick=closeSheet;const c=$('#sheetClose');if(c)c.onclick=closeSheet;}$$('[data-close]',p).forEach(b=>b.onclick=()=>{if(!locked)closeSheet();});
  }

  function closeSheet(){const p=$('#portal');if(p)p.innerHTML='';}

  function startEvents(){
    state.eventSource?.close();
    if(!state.accessToken || !apiConfigured()) return;
    const controller=new AbortController();
    state.eventSource={close:()=>controller.abort()};
    let cursor=0, refreshTimer=null;
    const scheduleRefresh=()=>{
      clearTimeout(refreshTimer);
      refreshTimer=setTimeout(async()=>{
        try{
          const [products,dashboard]=await Promise.all([request('/api/products'),request('/api/merchant/dashboard')]);
          state.products=products; state.dashboard=dashboard; state.report=null;
          state.imageUrls.clear(); await hydrateImages();
          if(['dashboard','cashier','products'].includes(state.page)) renderApp();
        }catch{}
      },350);
    };
    (async()=>{
      while(!controller.signal.aborted && state.accessToken){
        try{
          const res=await fetch(`${cfg.apiBaseUrl.replace(/\/$/,'')}/api/events?after=${cursor}`,{
            headers:{Authorization:`Bearer ${state.accessToken}`},signal:controller.signal
          });
          if(res.status===401){if(await refreshAccess())continue;break;}
          if(!res.ok||!res.body)throw new Error('EVENT_STREAM_FAILED');
          const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';
          while(!controller.signal.aborted){
            const {value,done}=await reader.read();if(done)break;
            buffer+=decoder.decode(value,{stream:true});
            let split;
            while((split=buffer.indexOf('\n\n'))>=0){
              const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);
              const idLine=frame.split('\n').find(x=>x.startsWith('id:'));
              if(idLine)cursor=Math.max(cursor,Number(idLine.slice(3).trim())||0);
              if(frame.includes('event:'))scheduleRefresh();
            }
          }
        }catch(e){if(controller.signal.aborted)break;await new Promise(r=>setTimeout(r,1800));}
      }
    })();
  }

  async function bootAfterIntro(){
    await loadThemePreference();
    if(!apiConfigured() && plugins().SakuRuntimeConfig?.get){ try{ cfg={...cfg,...await plugins().SakuRuntimeConfig.get()}; }catch{} }
    if(!apiConfigured()){entryOrAuth();return;}
    try{
      await retryPendingRevocation();
      const ok=await refreshAccess();
      if(!ok){entryOrAuth();return;}
      await routeAfterSession();
    }catch{await clearRefresh();state.accessToken=null;entryOrAuth();}
  }
  function boot(){
    // Native splash hands off to a fail-open, dependency-free branded motion sequence.
    try{cinematicIntro(()=>bootAfterIntro());}catch{bootAfterIntro();}
  }
  boot();
})();
