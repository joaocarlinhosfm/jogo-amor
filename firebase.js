// ── Firebase config ───────────────────────────────────────────
var fbConfig={
  apiKey:"AIzaSyAazeD15spy_zOY_guNx8X0l1_YJA7yqG4",
  authDomain:"jogoamor.firebaseapp.com",
  databaseURL:"https://jogoamor-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"jogoamor",
  storageBucket:"jogoamor.firebasestorage.app",
  messagingSenderId:"870402976066",
  appId:"1:870402976066:web:7daeeac7016aaa5ea580db"
};
var fbApp=firebase.initializeApp(fbConfig);
var db=firebase.database();
var rankRef=db.ref("ranking");
var playersRef=db.ref("players");

// ── Current session ───────────────────────────────────────────
var currentPlayer=null; // { key, name, photo, stats }
function getPlayerName(){ return currentPlayer?currentPlayer.name:(localStorage.getItem("amandaPlayerName")||""); }
function getPlayerKey(){
  if(currentPlayer)return currentPlayer.key;
  return localStorage.getItem("amandaPlayerKey")||null;
}

// ── Player key from name+pin ──────────────────────────────────
function makeKey(name,pin){
  // Store key as name_hash so PIN is not plaintext in Firebase
  var base=name.toUpperCase().replace(/[^A-Z0-9]/g,"")+"_"+pin;
  // Simple deterministic obfuscation (not cryptographic but avoids plaintext PIN)
  var h=0;for(var i=0;i<base.length;i++){h=((h<<5)-h)+base.charCodeAt(i);h|=0;}
  return name.toUpperCase().replace(/[^A-Z0-9]/g,"")+"_"+Math.abs(h).toString(36);
}

// ── Compress photo to small base64 ────────────────────────────
function compressPhoto(file,cb){
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var canvas=document.createElement("canvas");
      var size=120;
      canvas.width=canvas.height=size;
      var ctx2=canvas.getContext("2d");
      var s=Math.min(img.width,img.height);
      var ox=(img.width-s)/2, oy=(img.height-s)/2;
      ctx2.drawImage(img,ox,oy,s,s,0,0,size,size);
      cb(canvas.toDataURL("image/jpeg",.7));
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Auth: register ────────────────────────────────────────────
function registerPlayer(name,pin,photo,onSuccess,onError){
  var key=makeKey(name,pin);
  playersRef.child(key).once("value").then(function(snap){
    if(snap.exists()){
      onError("Nome ou PIN já existem. Tenta fazer Login.");
      return;
    }
    var data={name:name.toUpperCase(),photo:photo||"",
      stats:{best:0,totalGames:0,totalCoins:0,totalObs:0,bestCombo:0},ts:Date.now()};
    playersRef.child(key).set(data).then(function(){
      currentPlayer={key:key,name:data.name,photo:data.photo,stats:data.stats};
      localStorage.setItem("amandaPlayerName",data.name);
      localStorage.setItem("amandaPlayerKey",key);
      clearPin();
      onSuccess(currentPlayer);
    }).catch(function(){ onError("Erro ao criar conta. Tenta novamente."); });
  }).catch(function(){ onError("Sem ligação. Verifica a internet."); });
}

// ── Auth: login ───────────────────────────────────────────────
function loginPlayer(name,pin,onSuccess,onError){
  var key=makeKey(name,pin);
  playersRef.child(key).once("value").then(function(snap){
    if(!snap.exists()){
      onError("Nome ou PIN incorretos. Tenta de novo.");
      return;
    }
    var data=snap.val();
    currentPlayer={key:key,name:data.name,photo:data.photo||"",stats:data.stats||{}};
    localStorage.setItem("amandaPlayerName",data.name);
    localStorage.setItem("amandaPlayerKey",key);
    clearPin();
    // Sync local best with Firebase
    var localBest=parseInt(localStorage.getItem("amandaBest")||"0");
    if(localBest>(data.stats.best||0)){
      playersRef.child(key+"/stats/best").set(localBest);
      currentPlayer.stats.best=localBest;
    } else {
      localStorage.setItem("amandaBest",data.stats.best||0);
    }
    onSuccess(currentPlayer);
  }).catch(function(){ onError("Sem ligação. Verifica a internet."); });
}

// ── Update stats in Firebase ──────────────────────────────────
function syncStats(){
  var key=getPlayerKey();
  if(!key||!currentPlayer)return;
  var stats={
    best:parseInt(localStorage.getItem("amandaBest")||"0"),
    totalGames:parseInt(localStorage.getItem("amandaTotalGames")||"0"),
    totalCoins:parseInt(localStorage.getItem("amandaTotalCoins")||"0"),
    totalObs:parseInt(localStorage.getItem("amandaTotalObs")||"0"),
    bestCombo:parseInt(localStorage.getItem("amandaBestCombo")||"0")
  };
  currentPlayer.stats=stats;
  playersRef.child(key+"/stats").set(stats).catch(function(){});
}

// ── Auth UI ───────────────────────────────────────────────────
var _nameOnDone=null;
var _authMode="login"; // "login" | "register"
var _pendingPhoto="";

function showNamePrompt(onDone){
  _nameOnDone=onDone;
  hideAllScreens();
  document.getElementById("namePrompt").classList.remove("hidden");
  setAuthMode("login");
  setTimeout(function(){document.getElementById("nameInput").focus();},150);
}

function setAuthMode(mode){
  _authMode=mode;
  var photoWrap=document.getElementById("authPhotoWrap");
  var saveBtn=document.getElementById("nameSaveBtn");
  var tabs=document.querySelectorAll(".auth-tab");
  if(mode==="register"){
    if(photoWrap)photoWrap.style.display="flex";
    if(saveBtn)saveBtn.textContent="Criar Conta 💖";
    tabs[0]&&tabs[0].classList.remove("active");
    tabs[1]&&tabs[1].classList.add("active");
  } else {
    if(photoWrap)photoWrap.style.display="none";
    if(saveBtn)saveBtn.textContent="Entrar 💖";
    tabs[0]&&tabs[0].classList.add("active");
    tabs[1]&&tabs[1].classList.remove("active");
  }
  setAuthError("");
}

function getPinValue(){
  return ["pin1","pin2","pin3","pin4"].map(function(id){
    var el=document.getElementById(id);return el?el.value.trim():"";
  }).join("");
}
function clearPin(){
  ["pin1","pin2","pin3","pin4"].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value="";
  });
}
function setAuthError(msg){
  var el=document.getElementById("authError");
  if(el){el.textContent=msg;el.style.display=msg?"block":"none";}
}

function doAuth(){
  var name=document.getElementById("nameInput").value.trim();
  var pin=getPinValue();
  if(!name){setAuthError("Introduz o teu nome.");return;}
  if(pin.length!==4||!/^\d{4}$/.test(pin)){setAuthError("PIN deve ter 4 dígitos.");return;}
  var btn=document.getElementById("nameSaveBtn");
  if(btn)btn.textContent="A aguardar... ⏳";
  setAuthError("");
  if(_authMode==="register"){
    registerPlayer(name,pin,_pendingPhoto,function(player){
      if(btn)btn.textContent="Criar Conta 💖";
      document.getElementById("namePrompt").classList.add("hidden");
      if(_nameOnDone){var fn=_nameOnDone;_nameOnDone=null;fn();}
    },function(err){
      if(btn)btn.textContent="Criar Conta 💖";
      setAuthError(err);
    });
  } else {
    loginPlayer(name,pin,function(player){
      if(btn)btn.textContent="Entrar 💖";
      document.getElementById("namePrompt").classList.add("hidden");
      if(_nameOnDone){var fn=_nameOnDone;_nameOnDone=null;fn();}
    },function(err){
      if(btn)btn.textContent="Entrar 💖";
      setAuthError(err);
    });
  }
}

// ── Screen helpers ─────────────────────────────────────────────
function hideAllScreens(){
  ["landing","gameover","ranking","namePrompt","profile"].forEach(function(id){
    var el=document.getElementById(id);if(el)el.classList.add("hidden");
  });
  var t3=document.getElementById("top3Overlay");if(t3)t3.classList.remove("show");
  document.getElementById("hud").classList.remove("visible");
}
function showRanking(backFn){
  _rankBack=backFn||showMenu;
  hideAllScreens();
  document.getElementById("ranking").classList.remove("hidden");
  loadRanking();
}
var _rankBack=null;

// ── Submit score ───────────────────────────────────────────────
function submitScore(s){
  var name=getPlayerName();
  if(!name||s<=0)return;
  syncStats();
  rankRef.push({name:name,score:s,ts:Date.now()}).then(function(){
    checkIfTop3(s);
  }).catch(function(){});
}
function checkIfTop3(s){
  if(s<=0)return;
  rankRef.orderByChild("score").limitToLast(10).once("value").then(function(snap){
    var scores=[];
    snap.forEach(function(c){scores.push(c.val().score);});
    scores.sort(function(a,b){return b-a;});
    // Safe check: only compare against existing scores
    var limit=Math.min(scores.length,3);
    for(var i=0;i<limit;i++){
      if(s>=scores[i]){showTop3Overlay(s,i);return;}
    }
    // If fewer than 3 entries exist, any score qualifies for top 3
    if(scores.length<3){showTop3Overlay(s,scores.length);return;}
  }).catch(function(){});
}

// ── Top 3 overlay ──────────────────────────────────────────────
function showTop3Overlay(s,pos){
  var titles=["És o NÚMERO 1! 🥇","Incrível! 2º Lugar! 🥈","Fantástico! 3º Lugar! 🥉"];
  document.getElementById("top3Title").innerHTML="Parabéns!<br>"+titles[pos];
  document.getElementById("top3ScoreVal").textContent=s;
  document.getElementById("gameover").classList.add("hidden");
  document.getElementById("top3Overlay").classList.add("show");
  var list=document.getElementById("top3List");
  list.innerHTML='<div class="rank-loading">A carregar... 💕</div>';
  rankRef.orderByChild("score").limitToLast(10).once("value").then(function(snap){
    var entries=[];
    snap.forEach(function(c){entries.push(c.val());});
    entries.sort(function(a,b){return b.score-a.score;});
    list.innerHTML="";
    var medals=["🥇","🥈","🥉"];
    entries.slice(0,3).forEach(function(e,i){
      var row=document.createElement("div");
      row.className="rank-row";
      row.innerHTML='<div class="rank-pos '+(["gold","silver","bronze"][i])+'">'+medals[i]+'</div>'
        +'<div class="rank-name">'+e.name+'</div>'
        +'<div class="rank-score">'+e.score+'</div>';
      list.appendChild(row);
    });
  }).catch(function(){list.innerHTML='<div class="rank-empty">Erro a carregar 😔</div>';});
}

// ── Load ranking ───────────────────────────────────────────────
function loadRanking(){
  var list=document.getElementById("rankList");
  list.innerHTML='<div class="rank-loading">A carregar... 💕</div>';
  rankRef.orderByChild("score").limitToLast(10).once("value").then(function(snap){
    var entries=[];
    snap.forEach(function(c){entries.push(c.val());});
    entries.sort(function(a,b){return b.score-a.score;});
    if(!entries.length){
      list.innerHTML='<div class="rank-empty">Ainda não há scores!<br>Sê o primeiro 🚀</div>';
      return;
    }
    list.innerHTML="";
    var pos=["🥇","🥈","🥉"];
    var cls=["gold","silver","bronze"];
    entries.forEach(function(e,i){
      var row=document.createElement("div");
      row.className="rank-row";
      row.innerHTML='<div class="rank-pos '+(i<3?cls[i]:"other")+'">'+(i<3?pos[i]:"#"+(i+1))+'</div>'
        +'<div class="rank-name">'+e.name+'</div>'
        +'<div class="rank-score">'+e.score+'</div>';
      list.appendChild(row);
    });
  }).catch(function(){list.innerHTML='<div class="rank-empty">Erro a carregar 😔</div>';});
}

// ── Patch showGameOver ────────────────────────────────────────
var _origShowGameOver=showGameOver;
window.showGameOver=function(){
  submitScore(score);
  _origShowGameOver();
};

// ── Profile ───────────────────────────────────────────────────
var _profileBack=null;
function showProfile(backFn){
  _profileBack=backFn||showMenu;
  hideAllScreens();
  var screen=document.getElementById("profile");
  if(!screen)return;
  screen.classList.remove("hidden");
  var name=getPlayerName()||"—";
  document.getElementById("profileName").textContent=name;
  // Photo from Firebase player or fallback
  var av=document.getElementById("profileAvatar");
  if(av){
    if(currentPlayer&&currentPlayer.photo){
      av.src=currentPlayer.photo;
    } else { av.src="amanda.jpg"; }
  }
  // Prefer Firebase stats if available, fall back to localStorage
  var stats=currentPlayer&&currentPlayer.stats?currentPlayer.stats:{};
  var localBest=parseInt(localStorage.getItem("amandaBest")||"0");
  var best=Math.max(localBest,stats.best||0);
  var games=Math.max(parseInt(localStorage.getItem("amandaTotalGames")||"0"),stats.totalGames||0);
  var coins=Math.max(parseInt(localStorage.getItem("amandaTotalCoins")||"0"),stats.totalCoins||0);
  var obs=Math.max(parseInt(localStorage.getItem("amandaTotalObs")||"0"),stats.totalObs||0);
  var bc=Math.max(parseInt(localStorage.getItem("amandaBestCombo")||"0"),stats.bestCombo||0);
  document.getElementById("psBest").textContent=best;
  document.getElementById("psGames").textContent=games;
  document.getElementById("psCoins").textContent=coins;
  document.getElementById("psObs").textContent=obs;
  document.getElementById("psCombo").textContent=bc>=2?"x"+bc:"—";
}

// ── Wire all buttons ───────────────────────────────────────────
window.addEventListener("load",function(){
  // Auth tabs
  var tLogin=document.getElementById("tabLogin");
  var tReg=document.getElementById("tabRegister");
  if(tLogin)tLogin.addEventListener("pointerdown",function(){setAuthMode("login");});
  if(tReg)tReg.addEventListener("pointerdown",function(){setAuthMode("register");});

  // Save/auth button
  var ns=document.getElementById("nameSaveBtn");
  if(ns)ns.addEventListener("pointerdown",function(e){e.stopPropagation();doAuth();});

  // PIN auto-advance
  ["pin1","pin2","pin3","pin4"].forEach(function(id,idx){
    var el=document.getElementById(id);
    if(!el)return;
    el.addEventListener("input",function(){
      if(this.value.length>=1){
        this.value=this.value.slice(-1);
        var next=document.getElementById("pin"+(idx+2));
        if(next)next.focus();
        else document.getElementById("nameSaveBtn")&&document.getElementById("nameSaveBtn").focus();
      }
    });
    el.addEventListener("keydown",function(e){
      if(e.key==="Backspace"&&!this.value){
        var prev=document.getElementById("pin"+idx);
        if(prev)prev.focus();
      }
      if(e.key==="Enter")doAuth();
    });
  });

  // Name input enter
  var ni=document.getElementById("nameInput");
  if(ni)ni.addEventListener("keydown",function(e){
    if(e.key==="Enter")document.getElementById("pin1")&&document.getElementById("pin1").focus();
  });

  // Photo upload
  var photoCircle=document.getElementById("authPhotoCircle");
  var photoFile=document.getElementById("authPhotoFile");
  if(photoCircle&&photoFile){
    photoCircle.addEventListener("pointerdown",function(e){e.stopPropagation();photoFile.click();});
    photoFile.addEventListener("change",function(){
      if(!this.files||!this.files[0])return;
      compressPhoto(this.files[0],function(dataUrl){
        _pendingPhoto=dataUrl;
        var prev=document.getElementById("authPhotoPreview");
        var icon=document.getElementById("authPhotoIcon");
        if(prev){prev.src=dataUrl;prev.style.display="block";}
        if(icon)icon.style.display="none";
      });
    });
  }

  // Ranking back
  var rb=document.getElementById("rankBackBtn");
  if(rb)rb.addEventListener("pointerdown",function(){
    document.getElementById("ranking").classList.add("hidden");
    if(_rankBack)_rankBack();
  });

  // Ranking from gameover
  var rg=document.getElementById("rankGoBtn");
  if(rg)rg.addEventListener("pointerdown",function(){
    showRanking(function(){hideAllScreens();document.getElementById("gameover").classList.remove("hidden");});
  });

  // Top3 buttons
  var t3p=document.getElementById("top3PlayBtn");
  if(t3p)t3p.addEventListener("pointerdown",function(){
    document.getElementById("top3Overlay").classList.remove("show");startGame();
  });
  var t3m=document.getElementById("top3MenuBtn");
  if(t3m)t3m.addEventListener("pointerdown",function(){
    document.getElementById("top3Overlay").classList.remove("show");showMenu();
  });

  // Profile
  var pb=document.getElementById("profileBackBtn");
  if(pb)pb.addEventListener("pointerdown",function(){
    document.getElementById("profile").classList.add("hidden");
    if(_profileBack)_profileBack();
  });
  var pl=document.getElementById("profileLandBtn");
  if(pl)pl.addEventListener("pointerdown",function(){showProfile(showMenu);});

  // Tutorial OK
  var tok=document.getElementById("tutOkBtn");
  if(tok)tok.addEventListener("pointerdown",function(){
    localStorage.setItem("amandaTutorialSeen","1");
    document.getElementById("tutorial").classList.add("hidden");
  });

  // Try auto-login from localStorage
  var savedKey=localStorage.getItem("amandaPlayerKey");
  if(savedKey){
    playersRef.child(savedKey).once("value").then(function(snap){
      if(snap.exists()){
        var data=snap.val();
        currentPlayer={key:savedKey,name:data.name,photo:data.photo||"",stats:data.stats||{}};
      }
    }).catch(function(){});
  }
});

// ── Tutorial ──────────────────────────────────────────────────
function showTutorial(){
  hideAllScreens();
  document.getElementById("tutorial").classList.remove("hidden");
}
