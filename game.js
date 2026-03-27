// ── Mulberry32 PRNG (deterministic, seeded) ──────────────────
// Used in battle mode so both clients generate identical obstacles
var _prng=null;
function mulberry32(seed){
  return function(){
    seed|=0;seed=seed+0x6D2B79F5|0;
    var t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
}
function prngRand(){return _prng?_prng():Math.random();}
function setBattleSeed(seed){_prng=mulberry32(seed);}
function clearBattleSeed(){_prng=null;}

// ── Ship photos (random per game) ────────────────────────────
var SHIP_PHOTOS=["amanda.jpg","photo3.jpg","photo4.jpg","photo5.jpg"];
var amandaImg=new Image();
var _currentPhoto="amanda.jpg";
function pickRandomPhoto(){
  _currentPhoto=SHIP_PHOTOS[Math.floor(Math.random()*SHIP_PHOTOS.length)];
  amandaImg.src=_currentPhoto;
  document.getElementById("amandaHeroImg").src=_currentPhoto;
  amandaCache=null; // force cache rebuild
}
amandaImg.src="amanda.jpg";
document.getElementById("amandaHeroImg").src="amanda.jpg";

// ── Persisted stats (read once on load) ──────────────────────
var totalGames=parseInt(localStorage.getItem("amandaTotalGames")||"0");
var totalCoinsEver=parseInt(localStorage.getItem("amandaTotalCoins")||"0");
var totalObstaclesEver=parseInt(localStorage.getItem("amandaTotalObs")||"0");
var bestCombo=parseInt(localStorage.getItem("amandaBestCombo")||"0");

// ── Procedural Music Engine ───────────────────────────────────
var musicPlaying=false,musicScheduler=null;
var musicStep=0,musicBar=0,musicTempo=140,musicGain=null,musicMaster=null;
var kickBuffer=null,hatBuffer=null;

var NOTE_FREQ={
  A2:110,C3:130.81,D3:146.83,E3:164.81,G3:196,
  A3:220,C4:261.63,D4:293.66,E4:329.63,G4:392,A4:440,C5:523.25,D5:587.33,E5:659.25,G5:783.99
};

var MUSIC_SECTIONS=[
  {
    name:"dreamy",
    bass:[NOTE_FREQ.A2,NOTE_FREQ.C3,NOTE_FREQ.G3,NOTE_FREQ.E3],
    melody:[0,2,4,7,4,2,0,-1, 2,4,5,4,2,0,-1,-1, 4,5,7,9,7,5,4,-1, 2,4,7,5,4,2,0,-1],
    arp:[0,4,7,4, 2,5,7,5, 0,4,7,9, 7,5,4,2],
    kick:[1,0,0,0,1,0,0,0,1,0,1,0,1,0,0,0],
    hat:[1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,0],
    lead:"triangle",
    pad:"sine"
  },
  {
    name:"lift",
    bass:[NOTE_FREQ.A2,NOTE_FREQ.D3,NOTE_FREQ.E3,NOTE_FREQ.C3],
    melody:[0,2,4,5,7,5,4,2, 4,5,7,9,7,5,4,2, 5,7,9,10,9,7,5,4, 2,4,5,7,5,4,2,-1],
    arp:[0,5,9,5, 2,5,9,5, 4,7,10,7, 2,5,9,5],
    kick:[1,0,0,1,1,0,0,0,1,0,1,0,1,0,0,1],
    hat:[1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,0],
    lead:"triangle",
    pad:"triangle"
  },
  {
    name:"rush",
    bass:[NOTE_FREQ.A2,NOTE_FREQ.G3,NOTE_FREQ.D3,NOTE_FREQ.E3],
    melody:[0,4,7,9,7,4,0,2, 4,7,9,10,9,7,4,2, 5,7,10,12,10,7,5,4, 2,4,7,9,7,4,2,-1],
    arp:[0,7,9,7, 4,7,10,7, 2,5,9,5, 4,7,9,7],
    kick:[1,0,1,0,1,0,0,1,1,0,1,0,1,0,1,0],
    hat:[1,1,1,1,1,0,1,1,1,1,1,0,1,1,1,1],
    lead:"sawtooth",
    pad:"triangle"
  },
  {
    name:"suspense",
    bass:[NOTE_FREQ.A2,NOTE_FREQ.A2,NOTE_FREQ.G3,NOTE_FREQ.E3],
    melody:[0,-1,2,-1,4,-1,2,-1, 5,-1,4,-1,2,-1,0,-1, 0,-1,2,-1,5,-1,7,-1, 4,-1,2,-1,0,-1,2,-1],
    arp:[0,-1,4,-1, 2,-1,5,-1, 4,-1,7,-1, 2,-1,4,-1],
    kick:[1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0],
    hat:[0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
    lead:"sine",
    pad:"sawtooth"
  }
];
var MUSIC_SCALE=[NOTE_FREQ.A3,NOTE_FREQ.C4,NOTE_FREQ.D4,NOTE_FREQ.E4,NOTE_FREQ.G4,NOTE_FREQ.A4,NOTE_FREQ.C5,NOTE_FREQ.D5,NOTE_FREQ.E5,NOTE_FREQ.G5];

function getMusicSection(bar){
  var phraseBar=bar||0;
  if(score>=100)return MUSIC_SECTIONS[3];
  if(score>=80)return MUSIC_SECTIONS[(phraseBar%8<4)?1:2];
  if(score>=40)return MUSIC_SECTIONS[(phraseBar%8<4)?0:1];
  return MUSIC_SECTIONS[phraseBar%8<4?0:1];
}

function getMusicTempo(){
  if(!musicPlaying)return 140;
  if(score>=100)return Math.min(200,140+(score-100)*.6);
  return 140;
}

function ensureMusicBuffers(ac){
  if(!kickBuffer){
    kickBuffer=ac.createBuffer(1,Math.floor(ac.sampleRate*0.08),ac.sampleRate);
    var kd=kickBuffer.getChannelData(0);
    for(var i=0;i<kd.length;i++)kd[i]=(Math.random()*2-1)*Math.pow(1-i/kd.length,3);
  }
  if(!hatBuffer){
    hatBuffer=ac.createBuffer(1,Math.floor(ac.sampleRate*0.04),ac.sampleRate);
    var hd=hatBuffer.getChannelData(0);
    for(var j=0;j<hd.length;j++)hd[j]=(Math.random()*2-1)*Math.pow(1-j/hd.length,4);
  }
}

function musicNote(freq,start,dur,vol,type,dest){
  try{
    var ac=getAC();
    var o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(dest||musicMaster);
    o.type=type||"sine";
    o.frequency.setValueAtTime(freq,start);
    g.gain.setValueAtTime(0,start);
    g.gain.linearRampToValueAtTime(vol,start+0.01);
    g.gain.exponentialRampToValueAtTime(0.001,start+dur);
    o.start(start);o.stop(start+dur+0.05);
  }catch(e){}
}

function playNoiseHit(buffer,start,vol,filterType,filterFreq,dur){
  try{
    var ac=getAC();
    var src=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter();
    src.buffer=buffer;
    f.type=filterType;
    f.frequency.value=filterFreq;
    src.connect(f);f.connect(g);g.connect(musicMaster);
    g.gain.setValueAtTime(vol,start);
    g.gain.exponentialRampToValueAtTime(0.001,start+dur);
    src.start(start);
  }catch(e){}
}

function schedulePad(freq,start,step,section){
  var padVol=section.name==="suspense"?.04:.028;
  musicNote(freq,start,step*12,padVol,section.pad,musicMaster);
  musicNote(freq*1.5,start+step*2,step*8,section.name==="suspense"?.012:.018,"sine",musicMaster);
}

function scheduleMusic(){
  if(!musicPlaying)return;
  try{
    var ac=getAC();
    ensureMusicBuffers(ac);
    var now=ac.currentTime;
    var tempo=getMusicTempo();
    var step=60/tempo/4; // 16th note duration

    // Schedule 4 bars ahead for less repetition and smoother transitions
    var steps=64;
    for(var i=0;i<steps;i++){
      var t=now+(i*step);
      var globalStep=musicStep+i;
      var sectionBar=Math.floor(globalStep/16);
      var section=getMusicSection(sectionBar);
      var si=globalStep%section.melody.length;
      var bi=globalStep%section.kick.length;
      var barIndex=sectionBar%section.bass.length;
      var barStep=globalStep%16;

      // Kick drum (filtered noise burst)
      if(section.kick[bi]){
        playNoiseHit(kickBuffer,t,section.name==="suspense"?.18:.22,"lowpass",section.name==="suspense"?120:(score>=100?220:180),section.name==="suspense"?.12:.08);
      }

      // Hi-hat (every 8th note)
      if(section.hat[bi]){
        playNoiseHit(hatBuffer,t,section.name==="suspense"?.018:(score>=100?.05:.038),section.name==="suspense"?"bandpass":"highpass",section.name==="suspense"?2400:8000,section.name==="suspense"?.08:.04);
      }

      // Bass and pad at the start of each bar
      if(barStep===0){
        var bassFreq=section.bass[barIndex];
        musicNote(bassFreq,t,step*8,section.name==="suspense"?.16:.13,"sawtooth",musicMaster);
        musicNote(bassFreq*2,t+step*0.5,step*6,section.name==="suspense"?.03:.045,section.name==="suspense"?"sine":"triangle",musicMaster);
        schedulePad(bassFreq*2,t,step,section);
      }

      // Arpeggio fills the space between melody phrases
      if(barStep%2===0){
        var arpIndex=section.arp[globalStep%section.arp.length];
        if(arpIndex>=0&&MUSIC_SCALE[arpIndex]){
          musicNote(MUSIC_SCALE[arpIndex],t,section.name==="suspense"?step*.9:step*1.2,section.name==="suspense"?.012:(score>=100?.028:.02),section.name==="suspense"?"triangle":"sine",musicMaster);
        }
      }

      // Melody
      if(section.melody[si]>=0&&MUSIC_SCALE[section.melody[si]]){
        var mFreq=MUSIC_SCALE[section.melody[si]];
        var mVol=section.name==="suspense"?(barStep%8===0?.085:.055):(barStep===0?.1:barStep%4===0?.078:.06);
        var mDur=section.name==="suspense"?(barStep%8===0?step*4.2:step*1.4):(barStep%8===0?step*3.4:barStep%4===0?step*2.2:step*1.35);
        musicNote(mFreq,t,mDur,mVol,section.lead,musicMaster);
        // harmony a 5th above on strong beats
        if(barStep%8===0&&section.melody[si]+2<MUSIC_SCALE.length){
          musicNote(MUSIC_SCALE[section.melody[si]+2]*0.5,t,mDur*.9,section.name==="suspense"?mVol*.22:mVol*.4,"sine",musicMaster);
        }
      }

      if(section.name==="suspense"&&barStep%4===0){
        musicNote(section.bass[barIndex]*2,t+step*.15,step*.7,.025,"square",musicMaster);
      }
    }

    musicStep+=steps;
    musicBar+=steps/16;
    // Reschedule
    musicScheduler=setTimeout(scheduleMusic, steps*step*1000*0.55);
  }catch(e){}
}

function startMusic(){
  if(musicPlaying)return;
  try{
    var ac=getAC();
    musicMaster=ac.createGain();
    musicMaster.gain.value=0.55;
    musicMaster.connect(ac.destination);
    musicPlaying=true;musicStep=0;musicBar=0;
    scheduleMusic();
  }catch(e){}
}

function stopMusic(){
  musicPlaying=false;
  if(musicScheduler){clearTimeout(musicScheduler);musicScheduler=null;}
  if(musicMaster){
    try{musicMaster.gain.setTargetAtTime(0,getAC().currentTime,0.3);}catch(e){}
    setTimeout(function(){try{musicMaster.disconnect();}catch(e){}musicMaster=null;},500);
  }
}

function setMusicVolume(v){
  if(musicMaster)try{musicMaster.gain.setTargetAtTime(v,getAC().currentTime,.1);}catch(e){}
}


// ── Parallax stars (single implementation) ───────────────────
var sfCanvas=document.getElementById("starfield"),sfCtx=sfCanvas.getContext("2d");
var layers=[];
function initStars(){
  sfCanvas.width=window.innerWidth;sfCanvas.height=window.innerHeight;
  layers=[
    {stars:[],speed:.4, rMin:.3,rMax:.7, aMin:.15,aMax:.35,color:"200,180,220"},
    {stars:[],speed:1,  rMin:.4,rMax:1.1,aMin:.25,aMax:.55,color:"255,210,230"},
    {stars:[],speed:2.2,rMin:.8,rMax:1.8,aMin:.5, aMax:.9, color:"255,240,250"}
  ];
  layers.forEach(function(l,li){
    var n=li===0?80:li===1?60:30;
    for(var i=0;i<n;i++)l.stars.push({
      x:Math.random()*sfCanvas.width,y:Math.random()*sfCanvas.height,
      r:l.rMin+Math.random()*(l.rMax-l.rMin),
      alpha:l.aMin+Math.random()*(l.aMax-l.aMin),
      t:Math.random()*Math.PI*2
    });
  });
}
function drawStars(mv){
  sfCtx.clearRect(0,0,sfCanvas.width,sfCanvas.height);
  layers.forEach(function(l){
    for(var i=0;i<l.stars.length;i++){
      var s=l.stars[i];s.t+=.012;
      var a=s.alpha*(.8+.2*Math.sin(s.t));
      if(mv)s.x-=l.speed;
      if(s.x<0)s.x=sfCanvas.width;
      if(s.r<0.9){
        sfCtx.fillStyle="rgba("+l.color+","+a+")";
        sfCtx.fillRect(s.x,s.y,1,1);
      }else{
        sfCtx.beginPath();sfCtx.arc(s.x,s.y,s.r,0,Math.PI*2);
        sfCtx.fillStyle="rgba("+l.color+","+a+")";sfCtx.fill();
      }
    }
  });
}
initStars();window.addEventListener("resize",initStars);

// ── Floating hearts on landing ────────────────────────────────
(function(){
  var bg=document.getElementById("heartBg"),EM=["💕","💗","💖","💓","🌸","✨","💝"];
  for(var i=0;i<20;i++){
    var s=document.createElement("span");
    s.textContent=EM[i%7];s.style.left=(Math.random()*96)+"%";
    s.style.fontSize=(.7+Math.random()*1.1)+"rem";
    var dur=8+Math.random()*12,del=Math.random()*12;
    s.style.animation="riseHeart "+dur+"s "+del+"s linear infinite";
    bg.appendChild(s);
  }
})();

// ── Game globals ──────────────────────────────────────────────
var canvas=document.getElementById("gameCanvas"),ctx=canvas.getContext("2d");
var W,H,scaleF;
// ── DOM element cache (query once, avoid per-frame getElementById) ──
var _dom={};
function _el(id){return _dom[id]||(_dom[id]=document.getElementById(id));}
var gameState="menu";
var score=0,obstacleScore=0,coinScore=0;
var SCORE_PER_OBSTACLE=2,SCORE_PER_COIN=2,EARLY_OBSTACLE_SCORE=1;
var best=parseInt(localStorage.getItem("amandaBest")||"0");
var raf=null,loopActive=false;
var ship,obstacles=[],coins=[],particles=[];
var obstTimer=0,obstInterval,gravity,flapPower;
var gameReady=false,tilt=0,lastTime=0;
var lastMsgScore=0;var combo=0,comboTimer=0,COMBO_TIMEOUT=390;
var comboPopup={val:0,pts:1,alpha:0,y:0,active:false};
// ── Power-up state ────────────────────────────────────────────
var shieldActive=false,shieldTimer=0,SHIELD_DURATION=420; // frames
var invincible=false,invincibleTimer=0,INVINCIBLE_DURATION=60; // ~1s invincibility after shield hit
var magnetActive=false,magnetTimer=0,MAGNET_DURATION=450;
var freneticoActive=false,freneticoTimer=0,FRENETICO_DURATION=300; // reservado — não usado
var ghostActive=false,ghostTimer=0,GHOST_DURATION=180;            // 3s @ 60fps
var starActive=false,starTimer=0,STAR_DURATION=600;               // 10s @ 60fps
var cloverActive=false,cloverTimer=0,CLOVER_DURATION=600;         // 10s @ 60fps
var cloverFlashAlpha=0;
var announce100={alpha:0,active:false};
var powerUps=[]; // {x,y,type,r,pulse}

// ── Battle mode globals ───────────────────────────────────────
var battleMode=false;           // true when in a multiplayer match
var battleRole="";              // "A" or "B"
var battleRoomId="";
var battleOpponentY=0;          // latest Y from Firebase listener
var battleOpponentDead=false;
var battleOpponentScore=0;
var battleOpponentPhoto="";     // base64 or URL
var _opponentCache=null;        // offscreen canvas for ghost avatar
var _opponentCacheSize=0;
var battleCountdown=0;          // 3,2,1 countdown frames
var _battleStartTs=0;           // server timestamp to align start
var _publishInterval=null;      // setInterval handle
var _battleResultShown=false;

function buildOpponentCache(size){
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),r=size/2;
  c.beginPath();c.arc(r,r,r,0,Math.PI*2);
  c.fillStyle="rgba(230,225,255,0.14)";c.fill();
  c.beginPath();c.arc(r,r*0.70,r*0.30,0,Math.PI*2);
  c.fillStyle="rgba(210,205,255,0.60)";c.fill();
  c.beginPath();c.arc(r,r*1.52,r*0.50,Math.PI,0);
  c.fillStyle="rgba(210,205,255,0.60)";c.fill();
  c.beginPath();c.arc(r,r,r-1.5,0,Math.PI*2);
  c.strokeStyle="rgba(190,180,255,0.45)";c.lineWidth=2.5;c.stroke();
  _opponentCache=oc;_opponentCacheSize=size;
}
function drawGhostOpponent(ft){
  if(!battleMode)return;
  var sz=ship.w;
  if(!_opponentCache||_opponentCacheSize!==sz)buildOpponentCache(sz);
  if(!_opponentCache)return;
  var ghostY=Math.max(0,Math.min(H-sz,battleOpponentY));
  ctx.save();
  if(battleOpponentDead){
    ctx.globalAlpha=0.18;
    ctx.translate(ship.x+sz*0.4,ghostY+sz/2);
    ctx.rotate(1.1);
    ctx.drawImage(_opponentCache,-sz/2,-sz/2,sz,sz);
  } else {
    ctx.globalAlpha=0.40+0.08*Math.sin(ft*.004);
    ctx.drawImage(_opponentCache,ship.x-sz*0.1,ghostY,sz,sz);
    ctx.globalAlpha=0.60;
    ctx.font="bold "+(9*scaleF)+"px 'Quicksand',sans-serif";
    ctx.textAlign="center";ctx.fillStyle="#c8c8ff";
    ctx.fillText("👻",ship.x+sz*.4,ghostY-4*scaleF);
  }
  ctx.restore();
}

function startBattlePublish(){
  if(_publishInterval)clearInterval(_publishInterval);
  _publishInterval=setInterval(function(){
    if(!battleMode||!battleRoomId)return;
    if(typeof publishBattleState==="function")publishBattleState();
  },50);
}
function stopBattlePublish(){
  if(_publishInterval){clearInterval(_publishInterval);_publishInterval=null;}
}

function drawBattleCountdown(){
  if(battleCountdown<=0)return;
  var n=Math.ceil(battleCountdown/60);
  ctx.save();
  ctx.textAlign="center";ctx.textBaseline="middle";
  var sc=1+(1-battleCountdown%60/60)*0.4;
  ctx.translate(W/2,H/2);ctx.scale(sc,sc);
  ctx.font="bold "+(72*scaleF)+"px 'Pacifico',cursive";
  ctx.fillStyle="rgba(255,45,120,0.18)";ctx.fillText(n,3,3);
  ctx.fillStyle="#fff";ctx.fillText(n,0,0);
  ctx.restore();
}

function drawBattleHud(){
  if(!battleMode)return;
  // Show opponent score top-right small
  ctx.save();
  ctx.font="bold "+(11*scaleF)+"px 'Quicksand',sans-serif";
  ctx.textAlign="right";ctx.fillStyle="rgba(200,200,255,0.7)";
  ctx.fillText("👻 "+battleOpponentScore,W-10*scaleF,28*scaleF);
  ctx.restore();
}


function getScoreBoostMult(){return cloverActive?3:1;}
function getObstacleScoreValue(){return score<100?EARLY_OBSTACLE_SCORE:SCORE_PER_OBSTACLE;}

// ── Web Audio ─────────────────────────────────────────────────
var AC=null,noiseBuffer=null;
function getAC(){
  if(!AC)AC=new(window.AudioContext||window.webkitAudioContext)();
  if(AC.state==="suspended")AC.resume();
  return AC;
}
function buildNoiseBuffer(){
  try{
    var ac=getAC(),len=Math.floor(ac.sampleRate*.22),buf=ac.createBuffer(1,len,ac.sampleRate),d=buf.getChannelData(0);
    for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2)*.4;
    noiseBuffer=buf;
  }catch(e){}
}
function playBeep(freq,dur,vol,type){
  try{
    var ac=getAC();
    if(ac.state==="suspended"){ac.resume().then(function(){playBeep(freq,dur,vol,type);});return;}
    var o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    o.type=type||"sine";
    o.frequency.setValueAtTime(freq,ac.currentTime);
    g.gain.setValueAtTime(vol||.18,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);
    o.start(ac.currentTime);o.stop(ac.currentTime+dur+.01);
  }catch(e){}
}
function sndFlap(){playBeep(440,.08,.14,"sine");}
function sndCoin(){playBeep(880,.08,.18,"triangle");setTimeout(function(){playBeep(1320,.1,.14,"triangle");},80);}
function sndScore(){playBeep(550,.07,.15,"triangle");setTimeout(function(){playBeep(770,.1,.12,"triangle");},65);}
function sndCloverEnd(){
  playBeep(784,.08,.12,"triangle");
  setTimeout(function(){playBeep(659,.09,.1,"triangle");},70);
  setTimeout(function(){playBeep(523,.14,.11,"sine");},150);
}
function sndHit(){
  try{
    var ac=getAC();
    if(!noiseBuffer)buildNoiseBuffer();
    if(!noiseBuffer)return;
    var src=ac.createBufferSource(),g=ac.createGain();
    src.buffer=noiseBuffer;src.connect(g);g.connect(ac.destination);g.gain.value=.6;src.start();
  }catch(e){}
}


var THEMES={
  hearts:{
    name:"hearts",
    pipe:["#3d0020","#600030","#2a0018"],
    pipeStroke:"rgba(255,80,140,.6)",
    bgColors:["rgba(80,5,40,.22)","rgba(40,0,80,.18)","rgba(255,45,120,.1)"],
    starColor:"255,200,220",
    trail:["#ff2d78","#ff6fa0","#ffb3cc","#ff2d78","#ff8cb0"],
    floatEmojis:["\uD83D\uDC95","\uD83D\uDC97","\uD83D\uDC96","\uD83D\uDC93","\uD83C\uDF38","\u2728","\uD83D\uDC9D"]
  },
  galaxy:{
    name:"galaxy",
    pipe:["#0a0030","#1a0860","#050018"],
    pipeStroke:"rgba(120,80,255,.7)",
    bgColors:["rgba(20,5,80,.25)","rgba(60,0,120,.2)","rgba(0,200,255,.08)"],
    starColor:"180,160,255",
    trail:["#a78bfa","#7c3aed","#c4b5fd","#818cf8","#e0e7ff"],
    floatEmojis:["\uD83D\uDC31","\uD83D\uDE3A","\uD83D\uDC3E","\uD83C\uDF19","\u2B50","\uD83C\uDF1F","\uD83D\uDC08"]
  },
  garden:{
    name:"garden",
    pipe:["#1a4d1a","#2d7a2d","#0f3010"],
    pipeStroke:"rgba(144,238,100,.7)",
    bgColors:["rgba(30,120,40,.22)","rgba(80,180,60,.12)","rgba(200,255,180,.06)"],
    solidBg:"#071a08",
    backdrop:"garden",
    starColor:"160,255,160",
    trail:["#7ed957","#51cf66","#b7ef8a","#f783ac","#ffd43b"],
    floatEmojis:["\uD83C\uDF37","\uD83C\uDF3B","\uD83E\uDEB4","\uD83C\uDF43","\uD83D\uDC1D","\u2728","\uD83C\uDF53"]
  },
  sunset:{
    name:"sunset",
    pipe:["#411126","#70204b","#250815"],
    pipeStroke:"rgba(255,180,120,.72)",
    bgColors:["rgba(255,120,90,.22)","rgba(255,200,120,.12)","rgba(255,80,140,.08)"],
    solidBg:"#120f24",
    backdrop:"city",
    starColor:"255,190,140",
    trail:["#ff7b54","#ffb26b","#ffd56f","#ff8fab","#ffd6a5"],
    floatEmojis:["\uD83C\uDF05","\uD83C\uDFD6\uFE0F","\uD83E\uDEE9","\uD83E\uDD65","\uD83C\uDF79","\u2728","\uD83C\uDF3A"]
  },
  carnival:{
    name:"carnival",
    pipe:["#2a0f3f","#51206f","#180826"],
    pipeStroke:"rgba(255,224,112,.8)",
    bgColors:["rgba(255,210,80,.18)","rgba(255,90,160,.12)","rgba(120,70,255,.1)"],
    solidBg:"#160b2a",
    backdrop:"festival",
    starColor:"255,220,130",
    trail:["#ffd60a","#ff8fab","#8ce99a","#74c0fc","#c77dff"],
    floatEmojis:["\uD83C\uDFA0","\uD83C\uDFA1","\uD83C\uDF6C","\uD83C\uDF89","\uD83C\uDF81","\uD83C\uDF08","\u2728"]
  },
  aquarium:{
    name:"aquarium",
    pipe:["#042c34","#0b4f63","#031b22"],
    pipeStroke:"rgba(120,240,255,.72)",
    bgColors:["rgba(60,220,255,.14)","rgba(0,130,170,.12)","rgba(140,255,220,.08)"],
    solidBg:"#02161d",
    backdrop:"aquarium",
    starColor:"120,235,255",
    trail:["#5eead4","#67e8f9","#a7f3d0","#22d3ee","#ccfbf1"],
    floatEmojis:["\uD83D\uDC20","\uD83D\uDC1A","\uD83E\uDEBC","\uD83D\uDC2C","\uD83E\uDEB8","\uD83E\uDDAA","\u2728"]
  },
  desert:{
    name:"desert",
    pipe:["#4a2d14","#7a4c1f","#2a1708"],
    pipeStroke:"rgba(255,214,150,.7)",
    bgColors:["rgba(255,190,110,.16)","rgba(210,120,40,.12)","rgba(255,240,180,.08)"],
    solidBg:"#1b1020",
    backdrop:"desert",
    starColor:"255,214,160",
    trail:["#f4a261","#e9c46a","#ffd6a5","#f28482","#ffedd8"],
    floatEmojis:["\uD83C\uDF35","\uD83D\uDC2A","\uD83C\uDF1E","\uD83C\uDF7A","\uD83E\uDEB2","\uD83D\uDD25","\u2728"]
  },
  aurora:{
    name:"aurora",
    pipe:["#08142f","#133d67","#050b16"],
    pipeStroke:"rgba(168,255,214,.75)",
    bgColors:["rgba(100,255,180,.14)","rgba(60,180,255,.12)","rgba(220,255,255,.08)"],
    solidBg:"#020814",
    backdrop:"aurora",
    starColor:"180,255,235",
    trail:["#80ffdb","#64dfdf","#72efdd","#90e0ef","#caf0f8"],
    floatEmojis:["\u2744\uFE0F","\uD83C\uDF0C","\uD83C\uDF08","\uD83E\uDDCA","\uD83C\uDF20","\u2728","\uD83E\uDD0D"]
  }
};
var _currentTheme=THEMES.hearts;
var _obstacleTheme=THEMES.hearts;
var _lastThemeName="";
var _lastObstacleThemeName="";
var _bgFloaters=[]; // DOM spans for background emojis

function getTheme(){
  // Use obstacleScore for consistent thresholds (independent of combo multipliers)
  if(obstacleScore>=210)return THEMES.aurora;
  if(obstacleScore>=180)return THEMES.desert;
  if(obstacleScore>=150)return THEMES.aquarium;
  if(obstacleScore>=120)return THEMES.carnival;
  if(obstacleScore>=90)return THEMES.sunset;
  if(obstacleScore>=60)return THEMES.garden;
  if(obstacleScore>=30)return THEMES.galaxy;
  return THEMES.hearts;
}

function getObstacleTheme(){
  return getTheme();
}

function applyTheme(theme){
  if(theme.name===_lastThemeName)return; // no change
  _lastThemeName=theme.name;
  _currentTheme=theme;
  pipeCache={}; // force redraw with new colors
  _bgGrad1=null;_bgGradTheme=""; // force gradient cache rebuild
  invalidateBackdrop(); // force backdrop cache rebuild
  // Force all on-screen obstacles to redraw with new theme colors
  for(var i=0;i<obstacles.length;i++){obstacles[i]._pipeKey=null;}
  updateBgFloaters(theme);
  // Re-apply star layer colors
  if(layers&&layers.length){
    layers[0].color=theme.starColor;
    layers[1].color=theme.starColor;
    layers[2].color=theme.starColor;
  }
  if(sfCanvas)sfCanvas.style.opacity=theme.solidBg?".28":"1";
}

function applyObstacleTheme(theme){
  if(theme.name===_lastObstacleThemeName)return;
  _lastObstacleThemeName=theme.name;
  _obstacleTheme=theme;
  pipeCache={};
  for(var i=0;i<obstacles.length;i++){obstacles[i]._pipeKey=null;}
}

function updateBgFloaters(theme){
  var bg=document.getElementById("heartBg");
  if(!bg)return;
  bg.innerHTML="";
  _bgFloaters=[];
  for(var i=0;i<20;i++){
    var s=document.createElement("span");
    s.textContent=theme.floatEmojis[i%theme.floatEmojis.length];
    s.style.left=(Math.random()*96)+"%";
    s.style.fontSize=(.7+Math.random()*1.1)+"rem";
    var dur=8+Math.random()*12,del=Math.random()*12;
    s.style.animation="riseHeart "+dur+"s "+del+"s linear infinite";
    bg.appendChild(s);
    _bgFloaters.push(s);
  }
}

function drawCityBackdrop(theme){
  var horizon=H*.74;
  var glow=ctx.createLinearGradient(0,H*.2,0,horizon);
  glow.addColorStop(0,"rgba(255,180,120,.08)");
  glow.addColorStop(.55,theme.bgColors[0]);
  glow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=glow;
  ctx.fillRect(0,0,W,horizon);

  ctx.fillStyle="rgba(7,8,18,.92)";
  var x=0;
  while(x<W){
    var bw=(20+Math.abs(Math.sin(x*.13))*34)*scaleF;
    var bh=(70+Math.abs(Math.sin(x*.05))*120)*scaleF;
    ctx.fillRect(x,horizon-bh,bw,bh);
    if(Math.sin(x*.031)>0){
      ctx.fillStyle="rgba(255,214,120,.18)";
      for(var wy=horizon-bh+10*scaleF;wy<horizon-10*scaleF;wy+=12*scaleF){
        for(var wx=x+5*scaleF;wx<x+bw-5*scaleF;wx+=9*scaleF){
          if(((wx+wy)|0)%3===0)ctx.fillRect(wx,wy,3*scaleF,5*scaleF);
        }
      }
      ctx.fillStyle="rgba(7,8,18,.92)";
    }
    x+=bw-1;
  }
}

function drawFestivalBackdrop(theme){
  var horizon=H*.76;
  var glow=ctx.createLinearGradient(0,H*.18,0,horizon);
  glow.addColorStop(0,"rgba(255,210,90,.08)");
  glow.addColorStop(.5,theme.bgColors[1]);
  glow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=glow;
  ctx.fillRect(0,0,W,horizon);

  ctx.fillStyle="rgba(15,10,28,.95)";
  ctx.fillRect(0,horizon,W,H-horizon);
  for(var i=0;i<8;i++){
    var tx=(i/7)*W;
    var th=(26+(i%3)*16)*scaleF;
    ctx.beginPath();
    ctx.moveTo(tx-24*scaleF,horizon);
    ctx.lineTo(tx,horizon-th);
    ctx.lineTo(tx+24*scaleF,horizon);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle="rgba(255,214,90,.45)";
  ctx.lineWidth=2*scaleF;
  ctx.beginPath();
  ctx.arc(W*.82,horizon-48*scaleF,38*scaleF,0,Math.PI*2);
  ctx.stroke();
  for(var s=0;s<6;s++){
    ctx.beginPath();
    ctx.moveTo(W*.82,horizon-48*scaleF);
    ctx.lineTo(W*.82+Math.cos((Math.PI*2/6)*s)*38*scaleF,horizon-48*scaleF+Math.sin((Math.PI*2/6)*s)*38*scaleF);
    ctx.stroke();
  }
}

function drawAquariumBackdrop(theme){
  var floor=H*.82;
  var waterGlow=ctx.createLinearGradient(0,0,0,floor);
  waterGlow.addColorStop(0,"rgba(70,220,255,.08)");
  waterGlow.addColorStop(.55,theme.bgColors[0]);
  waterGlow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=waterGlow;
  ctx.fillRect(0,0,W,floor);

  ctx.fillStyle="rgba(4,34,38,.95)";
  ctx.fillRect(0,floor,W,H-floor);
  for(var i=0;i<6;i++){
    var coralX=(i/5)*W;
    var coralH=(28+Math.abs(Math.sin(i*1.7))*44)*scaleF;
    ctx.strokeStyle=i%2===0?"rgba(90,255,220,.28)":"rgba(255,150,190,.24)";
    ctx.lineWidth=4*scaleF;
    ctx.beginPath();
    ctx.moveTo(coralX,floor);
    ctx.quadraticCurveTo(coralX-10*scaleF,floor-coralH*.45,coralX+6*scaleF,floor-coralH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coralX+8*scaleF,floor);
    ctx.quadraticCurveTo(coralX+18*scaleF,floor-coralH*.35,coralX+2*scaleF,floor-coralH*.8);
    ctx.stroke();
  }
  ctx.fillStyle="rgba(180,255,245,.12)";
  for(var b=0;b<14;b++){
    var bx=(b*53%W);
    var by=(floor-((b*37)%220)*scaleF);
    ctx.beginPath();
    ctx.arc(bx,by,(2+(b%3))*scaleF,0,Math.PI*2);
    ctx.fill();
  }
}

function drawDesertBackdrop(theme){
  var horizon=H*.78;
  var skyGlow=ctx.createLinearGradient(0,H*.2,0,horizon);
  skyGlow.addColorStop(0,"rgba(255,190,120,.08)");
  skyGlow.addColorStop(.55,theme.bgColors[0]);
  skyGlow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=skyGlow;
  ctx.fillRect(0,0,W,horizon);

  ctx.fillStyle="rgba(85,45,18,.72)";
  ctx.beginPath();
  ctx.moveTo(0,horizon);
  for(var x=0;x<=W+10;x+=18*scaleF){
    ctx.lineTo(x,horizon-Math.abs(Math.sin(x*.02))*22*scaleF);
  }
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();

  ctx.fillStyle="rgba(35,18,10,.88)";
  ctx.beginPath();
  ctx.moveTo(W*.62,horizon);
  ctx.lineTo(W*.72,horizon-62*scaleF);
  ctx.lineTo(W*.82,horizon);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(W*.19,horizon-42*scaleF,14*scaleF,42*scaleF);
  ctx.fillRect(W*.185,horizon-47*scaleF,24*scaleF,8*scaleF);
}

function drawAuroraBackdrop(theme){
  var horizon=H*.8;
  var curtain=ctx.createLinearGradient(0,H*.08,W,horizon);
  curtain.addColorStop(0,"rgba(90,255,210,.05)");
  curtain.addColorStop(.35,"rgba(80,210,255,.11)");
  curtain.addColorStop(.7,"rgba(170,255,230,.08)");
  curtain.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=curtain;
  ctx.fillRect(0,0,W,horizon);

  for(var i=0;i<4;i++){
    var ax=W*(.12+i*.22);
    var ag=ctx.createLinearGradient(ax,0,ax+60*scaleF,horizon);
    ag.addColorStop(0,"rgba(120,255,210,0)");
    ag.addColorStop(.35,"rgba(120,255,210,.14)");
    ag.addColorStop(.7,"rgba(120,210,255,.06)");
    ag.addColorStop(1,"rgba(120,255,210,0)");
    ctx.fillStyle=ag;
    ctx.beginPath();
    ctx.moveTo(ax,horizon);
    ctx.quadraticCurveTo(ax-24*scaleF,H*.35,ax+25*scaleF,0);
    ctx.lineTo(ax+80*scaleF,0);
    ctx.quadraticCurveTo(ax+48*scaleF,H*.38,ax+62*scaleF,horizon);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle="rgba(8,14,28,.92)";
  ctx.beginPath();
  ctx.moveTo(0,horizon);
  ctx.lineTo(W*.18,horizon-30*scaleF);
  ctx.lineTo(W*.34,horizon-12*scaleF);
  ctx.lineTo(W*.48,horizon-48*scaleF);
  ctx.lineTo(W*.66,horizon-18*scaleF);
  ctx.lineTo(W*.82,horizon-42*scaleF);
  ctx.lineTo(W,horizon-16*scaleF);
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();
  ctx.fill();
}

function drawGardenBackdrop(theme){
  // Sky gradient — deep night green fading to lighter at horizon
  var sky=ctx.createLinearGradient(0,0,0,H*.72);
  sky.addColorStop(0,"#071a08");
  sky.addColorStop(.5,"#0e2e10");
  sky.addColorStop(1,"#163d18");
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);

  // Moon — soft pale disc top-right
  var moonX=W*.82,moonY=H*.09,moonR=18*scaleF;
  ctx.save();
  ctx.beginPath();ctx.arc(moonX,moonY,moonR*1.9,0,Math.PI*2);
  ctx.fillStyle="rgba(200,255,180,.07)";ctx.fill();
  ctx.beginPath();ctx.arc(moonX,moonY,moonR,0,Math.PI*2);
  ctx.fillStyle="rgba(230,255,200,.82)";ctx.fill();
  ctx.restore();

  // Distant tree line — silhouette of rounded treetops
  var horizon=H*.72;
  ctx.fillStyle="#0c2a0e";
  ctx.beginPath();ctx.moveTo(0,horizon);
  var treeStep=22*scaleF;
  for(var tx=0;tx<W+treeStep;tx+=treeStep){
    var th2=H*(.06+Math.abs(Math.sin(tx*.031+1.2))*.09);
    var tr=treeStep*.65;
    ctx.arc(tx,horizon-th2,tr,Math.PI,0);
  }
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();

  // Fireflies — small glowing dots scattered in mid-field
  ctx.save();
  var t=Date.now()*.0008;
  for(var fi=0;fi<18;fi++){
    var fx=(((fi*137.5)%100)/100)*W;
    var fy=horizon-H*.04-((fi*53)%100)/100*H*.22;
    var fa=Math.max(0,Math.sin(t*1.3+fi*0.7))*0.7;
    if(fa<0.05)continue;
    ctx.globalAlpha=fa;
    ctx.beginPath();ctx.arc(fx,fy,1.5*scaleF,0,Math.PI*2);
    ctx.fillStyle="#ccffaa";ctx.fill();
    // glow halo
    ctx.globalAlpha=fa*0.25;
    ctx.beginPath();ctx.arc(fx,fy,4*scaleF,0,Math.PI*2);
    ctx.fillStyle="#aaffaa";ctx.fill();
  }
  ctx.restore();

  // Ground plane — dark rich soil strip
  ctx.fillStyle="#0a1f0b";
  ctx.fillRect(0,horizon,W,H-horizon);

  // Foreground grass tufts along bottom edge
  ctx.fillStyle="#1a4d1a";
  ctx.beginPath();ctx.moveTo(0,H);
  var gstep=14*scaleF;
  for(var gx=0;gx<=W+gstep;gx+=gstep){
    var gh=H*.028+Math.abs(Math.sin(gx*.05))*H*.02;
    // blade left
    ctx.quadraticCurveTo(gx-gstep*.3,H-gh*.8,gx-gstep*.1,H-gh);
    ctx.quadraticCurveTo(gx+gstep*.1,H-gh*.8,gx,H);
  }
  ctx.lineTo(W,H);ctx.closePath();ctx.fill();

  // Lighter grass highlight
  ctx.fillStyle="#2a7a2a";
  ctx.beginPath();ctx.moveTo(0,H);
  for(var gx=0;gx<=W+gstep;gx+=gstep*1.3){
    var gh=H*.018+Math.abs(Math.sin(gx*.07+1))*H*.015;
    ctx.quadraticCurveTo(gx-gstep*.25,H-gh*.7,gx-gstep*.08,H-gh);
    ctx.quadraticCurveTo(gx+gstep*.08,H-gh*.7,gx,H);
  }
  ctx.lineTo(W,H);ctx.closePath();ctx.fill();
}

function drawThemeBackdrop(theme){
  if(theme.solidBg){
    ctx.fillStyle=theme.solidBg;
    ctx.fillRect(0,0,W,H);
  }
  if(theme.backdrop==="city")drawCityBackdrop(theme);
  else if(theme.backdrop==="garden")drawGardenBackdrop(theme);
  else if(theme.backdrop==="festival")drawFestivalBackdrop(theme);
  else if(theme.backdrop==="aquarium")drawAquariumBackdrop(theme);
  else if(theme.backdrop==="desert")drawDesertBackdrop(theme);
  else if(theme.backdrop==="aurora")drawAuroraBackdrop(theme);
}

// ── Surprise messages ─────────────────────────────────────────
var MSGS=[
  "Amo-te! ❤️","És incrível Amanda!","O meu coração é teu 💕","Foste feita para voar ✨",
  "A minha favorita 💗","Nunca pares de sorrir 🌸","Estou louco por ti 💖",
  "A mais linda do mundo 😍","Voa alto amor! 🚀","Cada dia mais apaixonado 💓",
  "A vida é mais bonita contigo 🌸","O teu riso é a minha música 🎶",
  "Contigo tudo faz sentido 💫","És o meu conto de fadas 👑",
  "O meu coração sorri por ti 💗","Amar-te é como respirar 🌬️❤️",
  "Nunca vou desistir de nós 💪❤️","Cada dia a teu lado é especial ✨",
  "Tu és a peça que faltava 🧩💕","És o meu destino, Amanda 💖"
];
var msgPopup={text:"",alpha:0,y:0,active:false};
function triggerMsg(txt){msgPopup.text=txt;msgPopup.alpha=1;msgPopup.y=H*.38;msgPopup.active=true;}
function drawMsg(){
  if(!msgPopup.active)return;
  msgPopup.alpha-=.00198;msgPopup.y-=.4*scaleF;
  if(msgPopup.alpha<=0){msgPopup.active=false;return;}
  ctx.save();ctx.globalAlpha=msgPopup.alpha;
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font="bold "+(18*scaleF)+"px 'Quicksand',sans-serif";
  ctx.fillStyle="rgba(180,0,60,0.55)";
  ctx.fillText(msgPopup.text,W/2+2,msgPopup.y+2);
  ctx.fillStyle="#fff";
  ctx.fillText(msgPopup.text,W/2,msgPopup.y);
  ctx.restore();
}

// ── Combo popup ───────────────────────────────────────────────
function showComboPopup(c,comboMult,isFren){
  comboPopup.val=c;comboPopup.pts=comboMult;comboPopup.fren=!!isFren;
  comboPopup.alpha=1;comboPopup.y=H*.4;comboPopup.active=true;
}
function drawComboPopup(){
  if(!comboPopup.active)return;
  comboPopup.alpha-=.022;comboPopup.y-=.5*scaleF;
  if(comboPopup.alpha<=0){comboPopup.active=false;return;}
  var mult=comboPopup.pts;
  var fren=comboPopup.fren;
  var totalMult=mult*(fren?2:1);
  // cor: dourado só se combo x3, laranja x2, branco x1 com frenético
  var col=mult>=3?"#ffd60a":mult>=2?"#ff9800":fren?"#ff6600":"#ff9800";
  ctx.save();ctx.globalAlpha=comboPopup.alpha;
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font="bold "+(20*scaleF)+"px 'Quicksand',sans-serif";
  ctx.fillStyle=col;
  // linha principal: mostra o multiplicador real total
  var label=fren&&mult>1?"x"+mult+" x⚡2 = x"+totalMult+" PONTOS!":
            fren?"x⚡2 PONTOS!":
            "x"+mult+" PONTOS!";
  ctx.fillText(label,W/2,comboPopup.y);
  ctx.font="bold "+(10*scaleF)+"px 'Quicksand',sans-serif";
  ctx.fillStyle="rgba(255,255,255,.7)";
  var sub=comboPopup.val>=5?"COMBO "+comboPopup.val+" seguidos":"⚡ FRENÉTICO ativo";
  ctx.fillText(sub,W/2,comboPopup.y+16*scaleF);
  ctx.restore();
}

// ── Amanda cache ──────────────────────────────────────────────
var amandaCache=null,amandaCacheSize=0;
function buildAmandaCache(size){
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),r=size/2;
  c.beginPath();c.arc(r,r,r,0,Math.PI*2);c.clip();
  if(amandaImg.complete&&amandaImg.naturalWidth>0)c.drawImage(amandaImg,0,0,size,size);
  else{c.fillStyle="#ff6fa8";c.fillRect(0,0,size,size);}
  c.beginPath();c.arc(r,r,r-1.5,0,Math.PI*2);
  c.strokeStyle="#ff2d6b";c.lineWidth=3;c.stroke();
  amandaCache=oc;amandaCacheSize=size;
}
var heartColors=["#ff2d78","#ff6fa0","#ffb3cc","#ff2d78","#ff8cb0"];
function resize(){W=Math.min(window.innerWidth,430);H=window.innerHeight;canvas.width=W;canvas.height=H;canvas.style.width=W+"px";canvas.style.height=H+"px";}

function initGame(){
  resize();scaleF=H/700;
  var sz=Math.round(45*scaleF);
  pickRandomPhoto(); // random photo per game
  buildAmandaCache(sz);
  ship={x:W*.22,y:H/2,w:sz,h:sz,vy:0,dead:false};
  gravity=.4657*scaleF;flapPower=-9.975*scaleF;
  obstacles=[];coins=[];particles=[];obstTimer=0;
  obstInterval=Math.floor(125/scaleF*.742);
  obstTimer=-obstInterval; // grace period
  score=0;obstacleScore=0;coinScore=0;
  combo=0;comboTimer=0;comboPopup.active=false;
  _lastThemeName="";_lastObstacleThemeName="";pipeCache={};applyTheme(THEMES.hearts);applyObstacleTheme(THEMES.hearts);
  shieldActive=false;shieldTimer=0;magnetActive=false;magnetTimer=0;
  invincible=false;invincibleTimer=0;
  freneticoActive=false;freneticoTimer=0;
  ghostActive=false;ghostTimer=0;
  starActive=false;starTimer=0;
  cloverActive=false;cloverTimer=0;
  cloverFlashAlpha=0;
  announce100.active=false;announce100.alpha=0;powerUps=[];_lastMilestone=0;
  battleCountdown=0;_battleResultShown=false;
  battleOpponentY=H/2;battleOpponentDead=false;battleOpponentScore=0;
  _opponentCache=null;
  msgPopup.active=false;
  gameReady=false;tilt=0;lastTime=0;lastMsgScore=0;
  // Increment totalGames here (correct place — game is starting)
  totalGames++;
  localStorage.setItem("amandaTotalGames",totalGames);
  buildNoiseBuffer();
  _el("scoreDisplay").textContent="0";
  _el("bestDisplay").textContent=best;
  var badge=_el("newRecordBadge");if(badge)badge.classList.remove("show");
}

// ── Draw Amanda ───────────────────────────────────────────────
function drawAmanda(x,y,w,h,tl,dead){
  if(!amandaCache||amandaCacheSize!==w)buildAmandaCache(w);
  ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(tl);
  if(dead)ctx.globalAlpha=.7;
  ctx.drawImage(amandaCache,-w/2,-h/2,w,h);
  ctx.restore();
}

// ── Background gradient cache (avoid recreating every frame) ──
var _bgGrad1=null,_bgGrad2=null,_bgGrad3=null,_bgGradTheme="";

// ── Backdrop offscreen cache (draw once, blit every frame) ────
var _backdropCanvas=null,_backdropCtx=null;
var _backdropTheme="",_backdropW=0,_backdropH=0;
function getBackdropCanvas(){
  if(!_backdropCanvas){
    _backdropCanvas=document.createElement("canvas");
    _backdropCtx=_backdropCanvas.getContext("2d");
  }
  return _backdropCanvas;
}
function invalidateBackdrop(){
  _backdropTheme=""; // force redraw next frame
}
function _drawBackdropTo(bctx,theme){
  // Temporarily point global ctx at offscreen canvas, then restore.
  // try/finally guarantees ctx is always restored even if backdrop throws.
  var _save=ctx;
  ctx=bctx;
  try{
    if(theme.backdrop==="city")drawCityBackdrop(theme);
    else if(theme.backdrop==="garden")drawGardenBackdrop(theme);
    else if(theme.backdrop==="festival")drawFestivalBackdrop(theme);
    else if(theme.backdrop==="aquarium")drawAquariumBackdrop(theme);
    else if(theme.backdrop==="desert")drawDesertBackdrop(theme);
    else if(theme.backdrop==="aurora")drawAuroraBackdrop(theme);
  }finally{
    ctx=_save;
  }
}
function drawThemeBackdropCached(theme){
  var bc=getBackdropCanvas();
  // Rebuild if theme, size, or firefly time bucket changed
  // For garden we rebuild every ~100ms for firefly animation (6fps is enough)
  var isAnimated=(theme.backdrop==="garden");
  var timeBucket=isAnimated?Math.floor(Date.now()/100):0;
  var needRebuild=(_backdropTheme!==theme.name||_backdropW!==W||_backdropH!==H||
                   (isAnimated&&_backdropTime!==timeBucket));
  if(needRebuild){
    bc.width=W;bc.height=H;
    _backdropTheme=theme.name;_backdropW=W;_backdropH=H;
    _backdropTime=timeBucket;
    // Draw directly into offscreen context — never touch global ctx
    var bctx=_backdropCtx;
    bctx.clearRect(0,0,W,H);
    if(theme.solidBg){bctx.fillStyle=theme.solidBg;bctx.fillRect(0,0,W,H);}
    _drawBackdropTo(bctx,theme);
  }
  // Blit — single drawImage instead of full redraw
  ctx.drawImage(bc,0,0);
}
var _backdropTime=0;

// ── Pipe cache ────────────────────────────────────────────────
var pipeCache={};
function getPipe(w,h,top){
  // Quantize h to 4px steps — moving obstacles get cache hits between frames
  var hq=Math.round(h/4)*4;
  var key=(top?"t":"b")+Math.round(w)+","+hq+_obstacleTheme.name;
  if(pipeCache[key])return pipeCache[key];
  var oc=document.createElement("canvas");oc.width=Math.ceil(w);oc.height=Math.ceil(h)+20;
  var c=oc.getContext("2d");
  var th=_obstacleTheme; // ← estava em falta após remoção da linha redundante
  var g=c.createLinearGradient(0,0,w,0);
  g.addColorStop(0,th.pipe[0]);g.addColorStop(.5,th.pipe[1]);g.addColorStop(1,th.pipe[2]);
  c.fillStyle=g;c.beginPath();
  var bumps=5;
  if(top){
    c.moveTo(0,0);c.lineTo(w,0);c.lineTo(w,h-14);
    for(var i=bumps;i>=0;i--){var px=(i/bumps)*w,jag=(i%2?1:-1)*(5+Math.sin(i*2)*8);c.lineTo(px,h+jag);}
    c.closePath();
  }else{
    c.moveTo(0,0);
    for(var i=0;i<=bumps;i++){var px=(i/bumps)*w,jag=(i%2?1:-1)*(5+Math.sin(i*2)*8);c.lineTo(px,jag);}
    c.lineTo(w,h);c.lineTo(0,h);c.closePath();
  }
  c.fill();c.strokeStyle=_obstacleTheme.pipeStroke;c.lineWidth=2;c.stroke();
  // Decoração interior: coração nos outros temas, relva no garden
  if(_obstacleTheme.name==="garden"){
    // Lâminas de relva na borda exposta do pipe
    var bladeCount=Math.floor(w/6)+2;
    var edgeY=top?h:0; // borda exposta: fundo do pipe top, topo do pipe bottom
    c.save();
    for(var b=0;b<bladeCount;b++){
      var bx=(b/(bladeCount-1))*w;
      var bh=(5+Math.abs(Math.sin(b*1.7))*9)*Math.min(scaleF,1);
      var lean=(Math.sin(b*2.3))*3;
      var col=b%3===0?"#7ed957":b%3===1?"#51cf66":"#b7ef8a";
      c.strokeStyle=col;c.lineWidth=2.2;c.lineCap="round";
      c.globalAlpha=0.85+Math.sin(b)*0.15;
      c.beginPath();
      if(top){
        // relva aponta para baixo (borda de baixo do pipe top)
        c.moveTo(bx,edgeY);
        c.quadraticCurveTo(bx+lean,edgeY+bh*.5,bx+lean*1.4,edgeY+bh);
      } else {
        // relva aponta para cima (borda de cima do pipe bottom)
        c.moveTo(bx,edgeY);
        c.quadraticCurveTo(bx+lean,edgeY-bh*.5,bx+lean*1.4,edgeY-bh);
      }
      c.stroke();
    }
    c.restore();
  } else {
    // Padrão: corações decorativos dentro do pipe
    c.globalAlpha=.22;c.fillStyle="#ff6fa0";
    for(var i=0;i<Math.floor(h/50);i++){
      var cy=top?h*.3+i*45:h*.2+i*45;
      if(cy<0||cy>h)continue;
      c.beginPath();var cx=w/2,cs=10;
      c.moveTo(cx,cy+cs*.7);c.bezierCurveTo(cx-cs*.8,cy+cs*.2,cx-cs*.8,cy-cs*.5,cx,cy-cs*.1);
      c.bezierCurveTo(cx+cs*.8,cy-cs*.5,cx+cs*.8,cy+cs*.2,cx,cy+cs*.7);c.fill();
    }
  }
  c.globalAlpha=1;
  pipeCache[key]=oc;
  return oc;
}
function drawObs(ob){
  if(ob.topY>0)ctx.drawImage(getPipe(ob.w,ob.topY,true),ob.x,0);
  var bY=ob.topY+ob.gap,bH=H-bY;
  if(bH>0)ctx.drawImage(getPipe(ob.w,bH,false),ob.x,bY);
}

// ── Coin ──────────────────────────────────────────────────────
var _coinR=0,_coinImg=null;
function buildCoinCanvas(r){
  var size=Math.ceil(r*4);
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),cx=size/2;
  c.beginPath();c.arc(cx,cx,r*1.4,0,Math.PI*2);
  c.fillStyle="rgba(255,215,0,.15)";c.fill();
  var cg=c.createRadialGradient(cx-r*.3,cx-r*.3,0,cx,cx,r);
  cg.addColorStop(0,"#fff9c4");cg.addColorStop(.5,"#ffd60a");cg.addColorStop(1,"#ff9800");
  c.beginPath();c.arc(cx,cx,r,0,Math.PI*2);c.fillStyle=cg;c.fill();
  c.strokeStyle="rgba(255,150,0,.6)";c.lineWidth=1.5;c.stroke();
  c.fillStyle="rgba(200,50,0,.75)";
  var s=r*.5;c.beginPath();
  c.moveTo(cx,cx+s*.6);
  c.bezierCurveTo(cx-s*.8,cx+s*.1,cx-s*.8,cx-s*.5,cx,cx-s*.1);
  c.bezierCurveTo(cx+s*.8,cx-s*.5,cx+s*.8,cx+s*.1,cx,cx+s*.6);
  c.fill();return oc;
}
function getCoinImg(r){if(r!==_coinR){_coinR=r;_coinImg=buildCoinCanvas(r);}return _coinImg;}

function spawnCoin(ob){
  coins.push({x:ob.x+ob.w/2,y:ob.topY+ob.gap/2,r:10.4*scaleF,
    collected:false,pulse:Math.random()*Math.PI*2,parentOb:ob,spawnTopY:ob.topY});
}
function drawCoins(spd,dt){
  for(var i=coins.length-1;i>=0;i--){
    var c=coins[i];
    c.x-=spd*dt;c.pulse+=.1;
    if(c.parentOb&&c.parentOb.moving){
      var drift=c.parentOb.topY-c.spawnTopY;
      c.y+=drift;c.spawnTopY=c.parentOb.topY;
    }
    if(c.x+c.r<0){coins.splice(i,1);continue;}
    if(c.collected)continue;
    // Magnet pulls coins toward ship
    if(magnetActive){
      var mdx=ship.x+ship.w/2-c.x,mdy=ship.y+ship.h/2-c.y;
      var mdist=Math.sqrt(mdx*mdx+mdy*mdy);
      if(mdist>1){c.x+=mdx/mdist*4*scaleF;c.y+=mdy/mdist*4*scaleF;}
    }
    var dx=c.x-(ship.x+ship.w/2),dy=c.y-(ship.y+ship.h/2);
    var colDist=c.r+ship.w*.45;
    if(dx*dx+dy*dy<colDist*colDist){
      c.collected=true;coinScore++;
      // Só encadeia combo se o timer ainda estiver activo; senão começa em 1
      if(comboTimer>0){combo++;}else{combo=1;}
      comboTimer=COMBO_TIMEOUT;
      var comboMult=combo>=10?3:combo>=5?2:1;
      if(comboMult>bestCombo){bestCombo=comboMult;localStorage.setItem("amandaBestCombo",bestCombo);}
      var pts=comboMult*SCORE_PER_COIN*getScoreBoostMult();
      score+=pts;totalCoinsEver++;
      // localStorage synced in syncStats() on game over
      _el("scoreDisplay").textContent=score;
      checkScoreMilestones();
      sndCoin();spawnH(c.x,c.y,6);
      if(combo>=5)showComboPopup(combo,comboMult,false);
      coins.splice(i,1);continue;
    }
    var scale=1+Math.sin(c.pulse)*.12;
    var img=getCoinImg(c.r);var sz=img.width;
    ctx.save();ctx.translate(c.x,c.y);ctx.scale(scale,scale);
    ctx.drawImage(img,-sz/2,-sz/2,sz,sz);ctx.restore();
  }
}

// ── Particles ─────────────────────────────────────────────────
var MAX_PARTICLES=32;
function spawnTrail(x,y){
  if(particles.length>MAX_PARTICLES)return;
  var spd=(1.2+Math.random()*1.8)*scaleF;
  var spread=(Math.random()-.5)*0.6;
  particles.push({x:x,y:y,vx:-spd,vy:spread*spd,life:1,
    size:(5+Math.random()*5)*scaleF,color:_currentTheme.trail[Math.floor(Math.random()*_currentTheme.trail.length)]});
}
function spawnH(x,y,n){
  if(particles.length>MAX_PARTICLES)particles.splice(0,particles.length-MAX_PARTICLES);
  for(var i=0;i<n;i++){
    var a=(Math.PI*2/n)*i+Math.random()*.6,spd=(1.5+Math.random()*3)*scaleF;
    particles.push({x:x,y:y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd-scaleF,
      life:1,size:(8+Math.random()*8)*scaleF,color:_currentTheme.trail[Math.floor(Math.random()*_currentTheme.trail.length)]});
  }
}
function drawPart(){
  for(var i=particles.length-1;i>=0;i--){
    var p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.06*scaleF;p.life-=.038;p.size*=.97;
    if(p.life<=0){particles.splice(i,1);continue;}
    ctx.save();ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.translate(p.x,p.y);
    var s=p.size;ctx.beginPath();ctx.moveTo(0,s*.65);
    ctx.bezierCurveTo(-s*.8,s*.2,-s*.8,-s*.4,0,-s*.05);
    ctx.bezierCurveTo(s*.8,-s*.4,s*.8,s*.2,0,s*.65);ctx.fill();ctx.restore();
  }
}


// ── Power-up canvas builders ──────────────────────────────────
function buildShieldCanvas(r){
  var size=Math.ceil(r*4);
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),cx=size/2,cy=size/2;
  // glow
  c.beginPath();c.arc(cx,cy,r*1.5,0,Math.PI*2);
  c.fillStyle="rgba(100,180,255,.15)";c.fill();
  // body
  var sg=c.createRadialGradient(cx-r*.3,cy-r*.3,0,cx,cy,r);
  sg.addColorStop(0,"#a8d8ff");sg.addColorStop(.5,"#378ADD");sg.addColorStop(1,"#0c447c");
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=sg;c.fill();
  c.strokeStyle="rgba(150,210,255,.8)";c.lineWidth=1.5;c.stroke();
  // shield symbol
  c.strokeStyle="rgba(255,255,255,.9)";c.lineWidth=r*.15;c.lineJoin="round";
  var s=r*.55;
  c.beginPath();
  c.moveTo(cx,cy+s*.8);
  c.lineTo(cx-s*.75,cy-s*.2);c.lineTo(cx-s*.75,cy-s*.8);
  c.lineTo(cx+s*.75,cy-s*.8);c.lineTo(cx+s*.75,cy-s*.2);
  c.lineTo(cx,cy+s*.8);c.stroke();
  return oc;
}
function buildMagnetCanvas(r){
  var size=Math.ceil(r*4);
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),cx=size/2;
  // glow
  c.beginPath();c.arc(cx,cx,r*1.5,0,Math.PI*2);
  c.fillStyle="rgba(255,100,180,.15)";c.fill();
  // body
  var mg=c.createRadialGradient(cx-r*.3,cx-r*.3,0,cx,cx,r);
  mg.addColorStop(0,"#ffb3cc");mg.addColorStop(.5,"#ff2d78");mg.addColorStop(1,"#720025");
  c.beginPath();c.arc(cx,cx,r,0,Math.PI*2);c.fillStyle=mg;c.fill();
  c.strokeStyle="rgba(255,179,204,.8)";c.lineWidth=1.5;c.stroke();
  // magnet symbol (U shape)
  c.strokeStyle="rgba(255,255,255,.9)";c.lineWidth=r*.18;c.lineCap="round";
  var s=r*.5;
  c.beginPath();c.moveTo(cx-s*.7,cx-s*.6);
  c.lineTo(cx-s*.7,cx+s*.3);
  c.arc(cx,cx+s*.3,s*.7,Math.PI,0);
  c.lineTo(cx+s*.7,cx-s*.6);c.stroke();
  // poles
  c.strokeStyle="rgba(200,255,200,.9)";
  c.beginPath();c.moveTo(cx-s*.7,cx-s*.6);c.lineTo(cx-s*.7,cx-s*.9);c.stroke();
  c.strokeStyle="rgba(255,200,200,.9)";
  c.beginPath();c.moveTo(cx+s*.7,cx-s*.6);c.lineTo(cx+s*.7,cx-s*.9);c.stroke();
  return oc;
}
var _shieldImg=null,_magnetImg=null,_shieldR=0,_magnetR=0;
var _freneticoImg=null,_ghostImg=null,_freneticoR=0,_ghostR=0;
var _starImg=null,_starR=0,_cloverImg=null,_cloverR=0;

function buildStarCanvas(r){
  var size=Math.ceil(r*4);
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),cx=size/2,cy=size/2;
  // glow arco-íris
  var glow=c.createRadialGradient(cx,cy,0,cx,cy,r*1.8);
  glow.addColorStop(0,"rgba(255,255,100,.35)");
  glow.addColorStop(1,"rgba(255,255,100,0)");
  c.beginPath();c.arc(cx,cy,r*1.8,0,Math.PI*2);c.fillStyle=glow;c.fill();
  // body dourado
  var sg=c.createRadialGradient(cx-r*.3,cy-r*.3,0,cx,cy,r);
  sg.addColorStop(0,"#fffde0");sg.addColorStop(.4,"#ffd60a");sg.addColorStop(1,"#ff8c00");
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=sg;c.fill();
  c.strokeStyle="rgba(255,240,100,.9)";c.lineWidth=1.5;c.stroke();
  // estrela de 5 pontas
  c.fillStyle="rgba(255,255,255,.92)";
  c.beginPath();
  for(var i=0;i<10;i++){
    var angle=i*Math.PI/5-Math.PI/2;
    var rad=i%2===0?r*.62:r*.28;
    var px=cx+Math.cos(angle)*rad;
    var py=cy+Math.sin(angle)*rad;
    i===0?c.moveTo(px,py):c.lineTo(px,py);
  }
  c.closePath();c.fill();
  return oc;
}

function buildFreneticoCanvas(r){
  var size=Math.ceil(r*4);
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),cx=size/2,cy=size/2;
  // glow laranja/vermelho
  c.beginPath();c.arc(cx,cy,r*1.5,0,Math.PI*2);
  c.fillStyle="rgba(255,80,0,.18)";c.fill();
  // body
  var fg=c.createRadialGradient(cx-r*.3,cy-r*.3,0,cx,cy,r);
  fg.addColorStop(0,"#fff0a0");fg.addColorStop(.4,"#ff6600");fg.addColorStop(1,"#8b1a00");
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=fg;c.fill();
  c.strokeStyle="rgba(255,180,50,.9)";c.lineWidth=1.5;c.stroke();
  // símbolo: raio ⚡
  c.strokeStyle="rgba(255,255,200,.95)";c.lineWidth=r*.16;c.lineJoin="round";c.lineCap="round";
  var s=r*.52;
  c.beginPath();
  c.moveTo(cx+s*.2,cy-s*.85);
  c.lineTo(cx-s*.3,cy-s*.05);
  c.lineTo(cx+s*.1,cy-s*.05);
  c.lineTo(cx-s*.2,cy+s*.85);
  c.lineTo(cx+s*.3,cy+s*.05);
  c.lineTo(cx-s*.1,cy+s*.05);
  c.closePath();c.stroke();c.fillStyle="rgba(255,255,200,.35)";c.fill();
  return oc;
}

function buildGhostCanvas(r){
  var size=Math.ceil(r*4);
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),cx=size/2,cy=size/2;
  // glow violeta
  c.beginPath();c.arc(cx,cy,r*1.5,0,Math.PI*2);
  c.fillStyle="rgba(180,100,255,.15)";c.fill();
  // body
  var gg=c.createRadialGradient(cx-r*.3,cy-r*.3,0,cx,cy,r);
  gg.addColorStop(0,"#e8ccff");gg.addColorStop(.5,"#9b59f5");gg.addColorStop(1,"#3a0070");
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=gg;c.fill();
  c.strokeStyle="rgba(210,170,255,.8)";c.lineWidth=1.5;c.stroke();
  // símbolo: fantasma 👻 simplificado
  c.fillStyle="rgba(255,255,255,.92)";
  var s=r*.5,gy=cy-s*.15;
  c.beginPath();
  c.arc(cx,gy,s*.7,Math.PI,0);        // cabeça
  c.lineTo(cx+s*.7,gy+s*.9);
  // ondas na base
  var wn=3,ww=s*1.4/wn;
  for(var i=0;i<wn;i++){
    var wx=cx+s*.7-i*ww;
    c.arc(wx-ww/2,gy+s*.9,(ww/2),0,Math.PI,i%2===0);
  }
  c.lineTo(cx-s*.7,gy);
  c.closePath();c.fill();
  // olhos
  c.fillStyle="rgba(80,0,140,.85)";
  c.beginPath();c.ellipse(cx-s*.25,gy-s*.05,s*.14,s*.17,0,0,Math.PI*2);c.fill();
  c.beginPath();c.ellipse(cx+s*.25,gy-s*.05,s*.14,s*.17,0,0,Math.PI*2);c.fill();
  return oc;
}

function buildCloverCanvas(r){
  var size=Math.ceil(r*4);
  var oc=document.createElement("canvas");oc.width=oc.height=size;
  var c=oc.getContext("2d"),cx=size/2,cy=size/2;
  c.beginPath();c.arc(cx,cy,r*1.55,0,Math.PI*2);
  c.fillStyle="rgba(120,255,140,.16)";c.fill();
  var cg=c.createRadialGradient(cx-r*.3,cy-r*.3,0,cx,cy,r);
  cg.addColorStop(0,"#e8ffe8");cg.addColorStop(.45,"#55d66b");cg.addColorStop(1,"#0f6b2a");
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=cg;c.fill();
  c.strokeStyle="rgba(180,255,190,.9)";c.lineWidth=1.5;c.stroke();
  c.fillStyle="rgba(255,255,255,.92)";
  var leafR=r*.26;
  c.beginPath();c.arc(cx,cy-r*.28,leafR,0,Math.PI*2);c.fill();
  c.beginPath();c.arc(cx-r*.28,cy,leafR,0,Math.PI*2);c.fill();
  c.beginPath();c.arc(cx+r*.28,cy,leafR,0,Math.PI*2);c.fill();
  c.beginPath();c.arc(cx,cy+r*.28,leafR,0,Math.PI*2);c.fill();
  c.strokeStyle="rgba(255,255,255,.9)";c.lineWidth=r*.11;c.lineCap="round";
  c.beginPath();c.moveTo(cx+r*.06,cy+r*.35);c.lineTo(cx+r*.33,cy+r*.7);c.stroke();
  return oc;
}

function getShieldImg(r){if(r!==_shieldR){_shieldR=r;_shieldImg=buildShieldCanvas(r);}return _shieldImg;}
function getMagnetImg(r){if(r!==_magnetR){_magnetR=r;_magnetImg=buildMagnetCanvas(r);}return _magnetImg;}
function getFreneticoImg(r){if(r!==_freneticoR){_freneticoR=r;_freneticoImg=buildFreneticoCanvas(r);}return _freneticoImg;}
function getGhostImg(r){if(r!==_ghostR){_ghostR=r;_ghostImg=buildGhostCanvas(r);}return _ghostImg;}
function getStarImg(r){if(r!==_starR){_starR=r;_starImg=buildStarCanvas(r);}return _starImg;}
function getCloverImg(r){if(r!==_cloverR){_cloverR=r;_cloverImg=buildCloverCanvas(r);}return _cloverImg;}

// ── Spawn functions ───────────────────────────────────────────
function spawnCoinRain(ob){
  var cx=ob.x+ob.w/2;
  var midY=ob.topY+ob.gap/2;
  var spread=ob.gap*.2;
  coins.push({x:cx-spread,y:midY-spread,r:10.4*scaleF,collected:false,pulse:0,parentOb:ob,spawnTopY:ob.topY});
  coins.push({x:cx,y:midY,r:10.4*scaleF,collected:false,pulse:1,parentOb:ob,spawnTopY:ob.topY});
  coins.push({x:cx+spread,y:midY+spread,r:10.4*scaleF,collected:false,pulse:2,parentOb:ob,spawnTopY:ob.topY});
}
function spawnPowerUp(ob,type){
  var r=11*scaleF;
  powerUps.push({x:ob.x+ob.w/2,y:ob.topY+ob.gap*.35,type:type,r:r,pulse:0,
    parentOb:ob,spawnTopY:ob.topY});
}

// ── Draw & collect power-ups ──────────────────────────────────
function drawPowerUps(spd,dt){
  for(var i=powerUps.length-1;i>=0;i--){
    var p=powerUps[i];
    p.x-=spd*dt;p.pulse+=.08;
    if(p.parentOb&&p.parentOb.moving){
      var drift=p.parentOb.topY-p.spawnTopY;
      p.y+=drift;p.spawnTopY=p.parentOb.topY;
    }
    if(p.x+p.r<0){powerUps.splice(i,1);continue;}
    // collect check
    var dx=p.x-(ship.x+ship.w/2),dy=p.y-(ship.y+ship.h/2);
    var colDist=p.r+ship.w*.4;
    if(dx*dx+dy*dy<colDist*colDist){
      if(p.type==="shield"){
        shieldActive=true;shieldTimer=SHIELD_DURATION;
        spawnH(p.x,p.y,8);playBeep(660,.15,.2,"sine");
      } else if(p.type==="magnet"){
        magnetActive=true;magnetTimer=MAGNET_DURATION;
        spawnH(p.x,p.y,8);playBeep(440,.15,.2,"sine");setTimeout(function(){playBeep(660,.1,.15,"sine");},100);
      } else if(p.type==="ghost"){
        ghostActive=true;ghostTimer=GHOST_DURATION;
        spawnH(p.x,p.y,10);
        playBeep(600,.1,.15,"sine");
        setTimeout(function(){playBeep(800,.1,.12,"sine");},80);
        setTimeout(function(){playBeep(1000,.15,.1,"sine");},160);
      } else if(p.type==="star"){
        starActive=true;starTimer=STAR_DURATION;
        spawnH(p.x,p.y,16);
        // jingle ascendente tipo Mario
        var notes=[523,659,784,1047];
        notes.forEach(function(n,i){setTimeout(function(){playBeep(n,.12,.2,"triangle");},i*80);});
      } else if(p.type==="clover"){
        cloverActive=true;cloverTimer=CLOVER_DURATION;
        spawnH(p.x,p.y,14);
        var notes=[440,554,659,880];
        notes.forEach(function(n,i){setTimeout(function(){playBeep(n,.12,.18,"triangle");},i*70);});
      }
      powerUps.splice(i,1);continue;
    }
    // draw — choose correct image per type
    var scale=1+Math.sin(p.pulse)*.1;
    var img;
    if(p.type==="shield")img=getShieldImg(p.r);
    else if(p.type==="magnet")img=getMagnetImg(p.r);
    else if(p.type==="star")img=getStarImg(p.r);
    else if(p.type==="clover")img=getCloverImg(p.r);
    else img=getGhostImg(p.r);
    var sz=img.width;
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(scale,scale);
    ctx.drawImage(img,-sz/2,-sz/2,sz,sz);ctx.restore();
  }
}

// ── Shield & Magnet auras ─────────────────────────────────────
function drawShieldAura(ft){
  var r=ship.w*.7;
  var alpha=.35+.15*Math.sin(ft*.005);
  ctx.save();
  ctx.beginPath();ctx.arc(ship.x+ship.w/2,ship.y+ship.h/2,r,0,Math.PI*2);
  ctx.strokeStyle="rgba(100,180,255,"+alpha+")";ctx.lineWidth=3*scaleF;ctx.stroke();
  ctx.strokeStyle="rgba(150,220,255,"+(alpha*.5)+")";ctx.lineWidth=6*scaleF;ctx.stroke();
  // timer bar
  var frac=shieldTimer/SHIELD_DURATION;
  ctx.beginPath();ctx.arc(ship.x+ship.w/2,ship.y+ship.h/2,r,
    -Math.PI/2,-Math.PI/2+Math.PI*2*frac);
  ctx.strokeStyle="rgba(100,200,255,.9)";ctx.lineWidth=3*scaleF;ctx.stroke();
  ctx.restore();
}
function drawMagnetAura(ft){
  var r=ship.w*1.8;
  var alpha=.2+.1*Math.sin(ft*.004);
  ctx.save();
  ctx.beginPath();ctx.arc(ship.x+ship.w/2,ship.y+ship.h/2,r,0,Math.PI*2);
  ctx.strokeStyle="rgba(255,45,120,"+alpha+")";ctx.lineWidth=2*scaleF;
  ctx.setLineDash([4*scaleF,4*scaleF]);ctx.stroke();ctx.setLineDash([]);
  // timer bar
  var frac=magnetTimer/MAGNET_DURATION;
  ctx.beginPath();ctx.arc(ship.x+ship.w/2,ship.y+ship.h/2,ship.w*.7,
    -Math.PI/2,-Math.PI/2+Math.PI*2*frac);
  ctx.strokeStyle="rgba(255,45,120,.9)";ctx.lineWidth=3*scaleF;ctx.stroke();
  ctx.restore();
}

function drawStarAura(ft){
  var t=ft*.002;
  // overlay arco-íris pulsante no canvas inteiro
  var hue=Math.floor((t*40)%360);
  ctx.save();
  ctx.fillStyle="hsla("+hue+",100%,60%,.07)";
  ctx.fillRect(0,0,W,H);
  // anel rotativo de 7 cores à volta da nave
  var cx=ship.x+ship.w/2,cy=ship.y+ship.h/2;
  var r=ship.w*.9;
  var colors=["#ff0000","#ff7700","#ffee00","#00cc00","#0088ff","#8800ff","#ff00cc"];
  for(var i=0;i<colors.length;i++){
    var a0=t+i*(Math.PI*2/colors.length);
    var a1=a0+Math.PI*2/colors.length*.85;
    ctx.beginPath();ctx.arc(cx,cy,r,a0,a1);
    ctx.strokeStyle=colors[i];ctx.lineWidth=3.5*scaleF;
    ctx.globalAlpha=.75+.2*Math.sin(t*3+i);ctx.stroke();
  }
  ctx.globalAlpha=1;
  // partículas de estrelinhas esporádicas
  if(Math.random()<.12)spawnH(ship.x+ship.w/2,ship.y+ship.h/2,2);
  // timer bar branca
  var frac=starTimer/STAR_DURATION;
  ctx.beginPath();ctx.arc(cx,cy,r+5*scaleF,-Math.PI/2,-Math.PI/2+Math.PI*2*frac);
  ctx.strokeStyle="rgba(255,255,255,.8)";ctx.lineWidth=2*scaleF;ctx.stroke();
  ctx.restore();
}

function drawCloverAura(ft){
  var cx=ship.x+ship.w/2,cy=ship.y+ship.h/2;
  var r=ship.w*.95;
  var alpha=.3+.12*Math.sin(ft*.006);
  ctx.save();
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle="rgba(90,255,130,"+alpha+")";ctx.lineWidth=3*scaleF;ctx.stroke();
  ctx.strokeStyle="rgba(200,255,210,"+(alpha*.55)+")";ctx.lineWidth=6*scaleF;ctx.stroke();
  for(var i=0;i<4;i++){
    var a=ft*.002+i*Math.PI/2;
    ctx.beginPath();
    ctx.arc(cx+Math.cos(a)*r*.72,cy+Math.sin(a)*r*.72,ship.w*.08,0,Math.PI*2);
    ctx.fillStyle="rgba(210,255,220,.55)";ctx.fill();
  }
  var frac=cloverTimer/CLOVER_DURATION;
  ctx.beginPath();ctx.arc(cx,cy,r+5*scaleF,-Math.PI/2,-Math.PI/2+Math.PI*2*frac);
  ctx.strokeStyle="rgba(120,255,160,.95)";ctx.lineWidth=3*scaleF;ctx.stroke();
  ctx.restore();
}

function drawCloverEndFlash(){
  if(cloverFlashAlpha<=0)return;
  ctx.save();
  ctx.globalAlpha=cloverFlashAlpha;
  ctx.fillStyle="rgba(120,255,160,.16)";
  ctx.fillRect(0,0,W,H);
  ctx.restore();
}

function drawGhostAura(ft){
  var now=ft;
  // nave semi-transparente — feito no drawAmanda com globalAlpha
  // anel violeta dashed
  var r=ship.w*.75;
  var alpha=.3+.15*Math.sin(now*.008);
  ctx.save();
  ctx.beginPath();ctx.arc(ship.x+ship.w/2,ship.y+ship.h/2,r,0,Math.PI*2);
  ctx.strokeStyle="rgba(180,100,255,"+alpha+")";ctx.lineWidth=2*scaleF;
  ctx.setLineDash([5*scaleF,3*scaleF]);ctx.stroke();ctx.setLineDash([]);
  // partículas de brilho roxo esporádicas
  if(Math.random()<.08)spawnH(ship.x+ship.w/2,ship.y+ship.h/2,2);
  // timer bar
  var frac=ghostTimer/GHOST_DURATION;
  ctx.beginPath();ctx.arc(ship.x+ship.w/2,ship.y+ship.h/2,r,
    -Math.PI/2,-Math.PI/2+Math.PI*2*frac);
  ctx.strokeStyle="rgba(200,130,255,.9)";ctx.lineWidth=3*scaleF;ctx.stroke();
  ctx.restore();
}

// ── 100 pts announcement ──────────────────────────────────────
function drawAnnounce100(){
  if(!announce100.active)return;
  announce100.alpha-=.008;
  if(announce100.alpha<=0){announce100.active=false;return;}
  var a=announce100.alpha;
  var scale=1+(1-a)*.5;
  ctx.save();
  ctx.globalAlpha=a;ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.translate(W/2,H*.28);ctx.scale(scale,scale);
  ctx.font="bold "+(28*scaleF)+"px 'Quicksand',sans-serif";
  ctx.fillStyle="rgba(255,180,0,.4)";ctx.fillText("100 PONTOS! 🎉",2,2);
  ctx.fillStyle="#ffd60a";ctx.fillText("100 PONTOS! 🎉",0,0);
  ctx.font="bold "+(13*scaleF)+"px 'Quicksand',sans-serif";
  ctx.fillStyle="rgba(255,255,255,.8)";ctx.fillText("Atingiste um nível lendário! 💕",0,26*scaleF);
  ctx.restore();
  // spawn party particles
  if(Math.random()<.10)spawnH(Math.random()*W,Math.random()*H*.5,2);
}

// ── Score milestone checks ────────────────────────────────────
var _lastMilestone=0;
function checkScoreMilestones(){
  if(score>=100&&_lastMilestone<100){
    _lastMilestone=100;
    announce100.active=true;announce100.alpha=1;
  }
}

// ── Game Loop ─────────────────────────────────────────────────
function gameLoop(ts){
  if(!loopActive)return;
  raf=requestAnimationFrame(gameLoop);
  var frameTime=Date.now(); // single timestamp for all auras this frame
  ctx.clearRect(0,0,W,H);
  // Themed background
  if(gameState==="playing"||gameState==="dead"){
    var th=_currentTheme;
    if(th.solidBg)drawThemeBackdropCached(th);
    // Reuse cached gradients — only recreate on theme change or resize
    if(!_bgGrad1||_bgGradTheme!==th.name){
      _bgGrad1=ctx.createRadialGradient(W*.2,H*.3,0,W*.2,H*.3,W*.9);
      _bgGrad1.addColorStop(0,th.bgColors[0]);_bgGrad1.addColorStop(1,"transparent");
      _bgGrad2=ctx.createRadialGradient(W*.8,H*.7,0,W*.8,H*.7,W*.7);
      _bgGrad2.addColorStop(0,th.bgColors[1]);_bgGrad2.addColorStop(1,"transparent");
      if(th.bgColors[2]){
        _bgGrad3=ctx.createRadialGradient(W*.5,H*.1,0,W*.5,H*.1,W*.6);
        _bgGrad3.addColorStop(0,th.bgColors[2]);_bgGrad3.addColorStop(1,"transparent");
      } else { _bgGrad3=null; }
      _bgGradTheme=th.name;
    }
    ctx.fillStyle=_bgGrad1;ctx.fillRect(0,0,W,H);
    ctx.fillStyle=_bgGrad2;ctx.fillRect(0,0,W,H);
    if(_bgGrad3){ctx.fillStyle=_bgGrad3;ctx.fillRect(0,0,W,H);}
  }
  drawCloverEndFlash();
  drawStars(gameReady);

  if(gameState==="playing"){
    if(!gameReady){
      ship.y=H/2+Math.sin(ts*.003)*12*scaleF;
      drawAmanda(ship.x,ship.y,ship.w,ship.h,0,false);
      // Battle countdown overlay
      if(battleMode&&battleCountdown>0){
        battleCountdown--;
        drawBattleCountdown();
        if(battleCountdown<=0){
          gameReady=true;lastTime=0;startMusic();
          startBattlePublish();
        }
      }
      drawPart();return;
    }

    if(!lastTime)lastTime=ts;
    var dt=Math.min((ts-lastTime)/16.67,1.0);lastTime=ts;
    if(cloverFlashAlpha>0){cloverFlashAlpha=Math.max(0,cloverFlashAlpha-.045*dt);}

    // Theme update
    applyTheme(getTheme());
    applyObstacleTheme(getObstacleTheme());
    // Combo decay — reset to 0 if timer expires between events
    if(combo>0){comboTimer-=dt*1.5;if(comboTimer<=0){combo=0;comboTimer=0;}}
    // Shield timer
    if(shieldActive){shieldTimer-=dt;if(shieldTimer<=0){shieldActive=false;shieldTimer=0;}}
    // Invincibility timer (after shield absorbs a hit)
    if(invincible){invincibleTimer-=dt;if(invincibleTimer<=0){invincible=false;invincibleTimer=0;}}
    // Ghost timer
    if(ghostActive){ghostTimer-=dt;if(ghostTimer<=0){ghostActive=false;ghostTimer=0;}}
    // Star timer
    if(starActive){starTimer-=dt;if(starTimer<=0){starActive=false;starTimer=0;}}
    // Clover timer
    if(cloverActive){cloverTimer-=dt;if(cloverTimer<=0){cloverActive=false;cloverTimer=0;cloverFlashAlpha=.32;sndCloverEnd();}}
    // Magnet timer
    if(magnetActive){magnetTimer-=dt;if(magnetTimer<=0){magnetActive=false;magnetTimer=0;}}
    // Power HUD
    var sb=_el("shieldBadge");if(sb)sb.className="pow-badge"+(shieldActive?" active":"");
    var mb=_el("magnetBadge");if(mb)mb.className="pow-badge"+(magnetActive?" active":"");
    var gb=_el("ghostBadge");if(gb)gb.className="pow-badge"+(ghostActive?" active":"");
    var stb=_el("starBadge");if(stb)stb.className="pow-badge"+(starActive?" active":"");
    var clb=_el("cloverBadge");if(clb)clb.className="pow-badge"+(cloverActive?" active":"");

    // Combo HUD
    var cb=_el("comboBar");
    if(cb){
      if(combo>=5){
        var mult=combo>=10?3:2;
        cb.classList.add("active");
        var cx=_el("comboX");
        if(cx)cx.textContent="x"+mult+" COMBO";
      }else{cb.classList.remove("active");}
    }

    ship.vy+=gravity*dt;
    ship.vy=Math.max(ship.vy,-12*scaleF);ship.vy=Math.min(ship.vy,12*scaleF);
    ship.y+=ship.vy*dt;
    var targetTilt=Math.max(-.45,Math.min(.9,ship.vy*.07));
    tilt+=(targetTilt-tilt)*.11*dt;
    if(Math.random()<.22)spawnTrail(ship.x,ship.y+ship.h*.5);

    obstTimer+=dt;
    if(obstTimer>=obstInterval){
      obstTimer=0;
      var post100Ease=score>=100?.95:1;
      var gRamp=Math.max(0,score-40);
      var gap=Math.max(H*.22,H*(.30+prngRand()*.1)-gRamp*H*.0007*post100Ease);
      if(score>=100)gap=Math.min(H*.42,gap*1.05);
      var topY=H*.1+prngRand()*(H-gap-H*.2);
      var movProb=score>=40?Math.min(.60,.40+(score-40)*.001667):0;
      if(score>=100)movProb*=.95;
      var moving=prngRand()<movProb;
      obstacles.push({x:W+10,w:65*scaleF,topY:topY,gap:gap,scored:false,coinSpawned:false,
        moving:moving,vy:moving?((.4+prngRand()*.5)*scaleF*(score>=100?.95:1)*(prngRand()<.5?1:-1)):0,
        minY:H*.06,maxY:H-gap-H*.06});
    }

    var ramp=Math.max(0,score-40);
    var spd=(2.571+ramp*.01575*(score>=100?.95:1))*scaleF;

    for(var i=obstacles.length-1;i>=0;i--){
      var ob=obstacles[i];ob.x-=spd*dt;
      if(ob.moving){
        ob.topY+=ob.vy*dt;
        if(ob.topY<=ob.minY||ob.topY>=ob.maxY)ob.vy*=-1;
        ob.topY=Math.max(ob.minY,Math.min(ob.maxY,ob.topY));
      }
      // Spawn coin — use obstacleScore+1 (next score) to be accurate
      if(!ob.coinSpawned&&ob.x<W*.75){
        ob.coinSpawned=true;
        var coinProb=(obstacleScore+1)<30?.31:Math.min(.51,.31+((obstacleScore+1)-30)*.003333);
        if(prngRand()<coinProb){
          // coin rain: 3 coins at once after score 100
          if(score>=100&&prngRand()<.15){spawnCoinRain(ob);}
          else{spawnCoin(ob);}
        }
        if(score>=60){
          var pu=prngRand();
          if(score>=100){
            if(pu<.03)      spawnPowerUp(ob,"star");      // 3% ⭐ raro
            else if(pu<.09) spawnPowerUp(ob,"shield");    // 6%
            else if(pu<.15) spawnPowerUp(ob,"magnet");    // 6%
            else if(pu<.19) spawnPowerUp(ob,"ghost");     // 4%
            else if(pu<.22) spawnPowerUp(ob,"clover");    // 3%
          } else if(score>=80){
            if(pu<.03)      spawnPowerUp(ob,"star");      // 3% ⭐ raro
            else if(pu<.11) spawnPowerUp(ob,"ghost");     // 8%
            else if(pu<.16) spawnPowerUp(ob,"shield");    // 5%
            else if(pu<.20) spawnPowerUp(ob,"magnet");    // 4%
          } else {
            if(pu<.03)      spawnPowerUp(ob,"star");      // 3% ⭐ raro
            else if(pu<.13) spawnPowerUp(ob,"ghost");     // 10%
          }
        }
      }
      if(!ob.scored&&ob.x+ob.w<ship.x){
        ob.scored=true;obstacleScore++;
        score+=getObstacleScoreValue()*getScoreBoostMult();totalObstaclesEver++;
        // localStorage synced in syncStats() on game over
        _el("scoreDisplay").textContent=score;
        checkScoreMilestones();
        sndScore();spawnH(ship.x+ship.w,ship.y+ship.h/2,8);

        if(obstacleScore%10===0&&obstacleScore!==lastMsgScore){
          lastMsgScore=obstacleScore;
          triggerMsg(MSGS[Math.floor(Math.random()*MSGS.length)]);
        }
      }
      if(ob.x+ob.w<-20)obstacles.splice(i,1);
    }

    for(var i=0;i<obstacles.length;i++)drawObs(obstacles[i]);
    drawCoins(spd,dt);
    drawPowerUps(spd,dt);
    drawAnnounce100();

    var sx=ship.x+7*scaleF,sy=ship.y+7*scaleF,sw=ship.w-14*scaleF,sh=ship.h-14*scaleF;
    // Estrela = invencibilidade total (pipes + chão + tecto)
    var hit=starActive?false:(ship.y+ship.h>H||ship.y<0);
    if(!invincible&&!ghostActive&&!starActive){
      for(var i=0;i<obstacles.length;i++){
        var ob=obstacles[i];
        if(sx+sw>ob.x&&sx<ob.x+ob.w&&(sy<ob.topY||sy+sh>ob.topY+ob.gap))hit=true;
      }
    }
    // Shield absorbs one hit and grants invincibility frames
    if(hit&&shieldActive){
      hit=false;shieldActive=false;shieldTimer=0;
      invincible=true;invincibleTimer=INVINCIBLE_DURATION;
      spawnH(ship.x+ship.w/2,ship.y+ship.h/2,12);
      ship.shieldFlash=30; // longer flash to signal invincibility
    }
    if(hit){
      sndHit();spawnH(ship.x+ship.w/2,ship.y+ship.h/2,14);
      combo=0;comboTimer=0;
      var gw=_el("game-wrap");
      gw.classList.add("shake");
      setTimeout(function(){gw.classList.remove("shake");},400);
      gameState="dead";ship.dead=true;
      if(score>best){best=score;localStorage.setItem("amandaBest",best);}
      if(battleMode){
        // In battle: publish death, keep loop alive to watch opponent, wait for result
        if(typeof publishBattleState==="function")publishBattleState(true);
        stopBattlePublish();
        ctx.clearRect(0,0,W,H);drawStars(false);
        for(var ii=0;ii<obstacles.length;ii++)drawObs(obstacles[ii]);
        drawAmanda(ship.x,ship.y+5,ship.w,ship.h,1.1,true);
        drawPart();
        // Result shown by Firebase listener once opponent also dies or concedes
        return;
      } else {
        loopActive=false;
        stopMusic();
        ctx.clearRect(0,0,W,H);drawStars(false);
        for(var ii=0;ii<obstacles.length;ii++)drawObs(obstacles[ii]);
        drawAmanda(ship.x,ship.y+5,ship.w,ship.h,1.1,true);
        drawPart();
        setTimeout(showGameOver,800);return;
      }
    }

    // Ghost: nave semi-transparente com shimmer violeta
    if(ghostActive){
      ctx.save();ctx.globalAlpha=0.45+0.15*Math.sin(frameTime*.015);
      drawAmanda(ship.x,ship.y,ship.w,ship.h,tilt,false);
      ctx.restore();
    } else {
      drawAmanda(ship.x,ship.y,ship.w,ship.h,tilt,false);
    }
    if(ship.shieldFlash>0){
      ship.shieldFlash--;
      if(invincible&&Math.floor(invincibleTimer)%6<3){
        ctx.save();
        ctx.beginPath();ctx.arc(ship.x+ship.w/2,ship.y+ship.h/2,ship.w*.65,0,Math.PI*2);
        ctx.strokeStyle="rgba(100,210,255,.85)";ctx.lineWidth=3*scaleF;ctx.stroke();
        ctx.restore();
      }
    }
    if(shieldActive){drawShieldAura(frameTime);}
    if(magnetActive){drawMagnetAura(frameTime);}
    if(ghostActive){drawGhostAura(frameTime);}
    if(starActive){drawStarAura(frameTime);}
    if(cloverActive){drawCloverAura(frameTime);}
    drawComboPopup();
    drawMsg();
    drawGhostOpponent(frameTime);
    drawBattleHud();

  }else if(gameState==="dead"){
    for(var i=0;i<obstacles.length;i++)drawObs(obstacles[i]);
    drawAmanda(ship.x,ship.y+5,ship.w,ship.h,1.1,true);
    drawGhostOpponent(frameTime);
  }
  drawPart();
}

function menuLoop(ts){
  if(!loopActive)return;
  raf=requestAnimationFrame(menuLoop);
  sfCtx.clearRect(0,0,sfCanvas.width,sfCanvas.height);
  drawStars(false);
}

// ── Screens ───────────────────────────────────────────────────
function stopLoop(){loopActive=false;if(raf)cancelAnimationFrame(raf);raf=null;}
function showMenu(){
  stopLoop();
  stopBattlePublish();
  battleMode=false;battleRole="";battleRoomId="";clearBattleSeed();
  if(typeof leaveBattleRoom==="function")leaveBattleRoom();
  if(ctx)ctx.clearRect(0,0,W,H);
  stopMusic();
  var cb=_el("comboBar");if(cb)cb.classList.remove("active");
  var sb=_el("shieldBadge");if(sb)sb.classList.remove("active");
  var mb=_el("magnetBadge");if(mb)mb.classList.remove("active");
  var gb=_el("ghostBadge");if(gb)gb.classList.remove("active");
  var stb=_el("starBadge");if(stb)stb.classList.remove("active");
  var clb=_el("cloverBadge");if(clb)clb.classList.remove("active");
  var gw=_el("game-wrap");if(gw)gw.style.visibility="hidden";
  ["gameover","ranking","namePrompt"].forEach(function(id){
    var el=document.getElementById(id);if(el)el.classList.add("hidden");
  });
  var t3=document.getElementById("top3Overlay");if(t3)t3.classList.remove("show");
  document.getElementById("landing").classList.remove("hidden");
  _el("hud").classList.remove("visible");
  gameState="menu";loopActive=true;requestAnimationFrame(menuLoop);
}
function startGame(opts){
  // opts: optional {battle:true, role:"A"|"B", roomId:"ABCD", seed:1234567}
  var loggedIn=(typeof currentPlayer!=="undefined"&&currentPlayer!==null)
               ||!!localStorage.getItem("amandaPlayerKey");
  if(!loggedIn){
    if(typeof showNamePrompt==="function"){showNamePrompt(function(){startGame(opts);});}
    return;
  }
  stopLoop();
  // Apply battle config before initGame
  if(opts&&opts.battle){
    battleMode=true;
    battleRole=opts.role||"A";
    battleRoomId=opts.roomId||"";
    if(opts.seed)setBattleSeed(opts.seed);
  } else {
    battleMode=false;
    battleRole="";
    battleRoomId="";
    clearBattleSeed();
  }
  var gw=_el("game-wrap");if(gw)gw.style.visibility="visible";
  document.getElementById("landing").classList.add("hidden");
  document.getElementById("gameover").classList.add("hidden");
  var lobby=document.getElementById("battleLobby");if(lobby)lobby.classList.add("hidden");
  _el("hud").classList.add("visible");
  initGame();
  // Set countdown AFTER initGame (initGame resets it to 0)
  if(opts&&opts.battle){
    battleCountdown=180; // 3 seconds @ 60fps — overrides initGame reset
  }
  gameState="playing";loopActive=true;requestAnimationFrame(gameLoop);
  // In battle mode the countdown fires in the loop; music starts after countdown
  if(!battleMode){
    // First time tutorial
    if(totalGames===1&&!localStorage.getItem("amandaTutorialSeen")){
      setTimeout(function(){
        if(typeof showTutorial==="function")showTutorial();
      },500);
    }
  }
}
function showGameOver(){
  document.getElementById("gameover").classList.remove("hidden");
  _el("hud").classList.remove("visible");
  document.getElementById("goScore").textContent=score;
  document.getElementById("goBest").textContent=best;
  document.getElementById("goAst").textContent=obstacleScore;
  document.getElementById("goCoins").textContent=coinScore;
  var badge=_el("newRecordBadge");
  if(badge){if(score>0&&score>=best)badge.classList.add("show");else badge.classList.remove("show");}
}

// ── Input ─────────────────────────────────────────────────────
var _lastFlap=0;
function flap(){
  if(gameState!=="playing")return;
  var now=performance.now();
  if(now-_lastFlap<50)return;
  _lastFlap=now;
  if(!gameReady){
    if(battleMode)return; // countdown controls gameReady in battle
    gameReady=true;lastTime=0;startMusic();
  }
  ship.vy=ship.vy*.15+flapPower*.85;
  sndFlap();spawnH(ship.x+ship.w*.05,ship.y+ship.h*.6,5);
}
document.addEventListener("pointerdown",function(e){if(e.isPrimary)flap();});
document.addEventListener("keydown",function(e){if(e.code==="Space")flap();});

// ── Button registration ───────────────────────────────────────
function reg(id,fn){
  var b=document.getElementById(id);if(!b)return;
  b.addEventListener("pointerdown",function(e){e.stopPropagation();e.preventDefault();fn();});
}
window.addEventListener("load",function(){
  reg("startBtn",   function(){startGame();});
  reg("restartBtn", function(){startGame();});
  reg("menuBtn",    function(){showMenu();});
  reg("rankLandBtn",function(){if(typeof showRanking==="function")showRanking(showMenu);});
  // Mute toggle
  var muted=false;
  var muteBtn=document.getElementById("muteBtn");
  if(muteBtn)muteBtn.addEventListener("pointerdown",function(e){
    e.stopPropagation();
    muted=!muted;
    setMusicVolume(muted?0:.55);
    muteBtn.textContent=muted?"🔇":"🔊";
  });
});

amandaImg.onload=function(){buildAmandaCache(amandaCacheSize||Math.round(45*H/700)||45);};
if(amandaImg.complete&&amandaImg.naturalWidth)buildAmandaCache(Math.round(45*H/700)||45);
resize();
window.addEventListener("resize",function(){pipeCache={};_coinR=0;_coinImg=null;_bgGrad1=null;_bgGradTheme="";invalidateBackdrop();if(gameState==="playing")initGame();else resize();});
loopActive=true;requestAnimationFrame(menuLoop);
