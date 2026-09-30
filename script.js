// ChessBot Arena - self-contained chess engine.
// Human = White, ChessBot = Black.
// Includes legal move generation, check/checkmate/stalemate,
// castling, en-passant, promotion, minimax and alpha-beta search.

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const turnText = document.getElementById("turnText");
const difficultyEl = document.getElementById("difficulty");
const botLevelEl = document.getElementById("botLevel");
const chatEl = document.getElementById("chat");
const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undo");
const timeControlEl = document.getElementById("timeControl");
const botTimeEl = document.getElementById("botTime");
const youTimeEl = document.getElementById("youTime");
const botClockEl = document.getElementById("botClock");
const youClockEl = document.getElementById("youClock");

const WHITE = "w", BLACK = "b";
const PIECES = {
  w:{k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙"},
  b:{k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"}
};
const VALUES={p:100,n:320,b:330,r:500,q:900,k:20000};

let state, selected=null, history=[], botThinking=false;
let clockInterval=null;
let timeLimit=180;
let clocks={w:180,b:180};
let lastClockTick=Date.now();
let gameFinished=false;

function initialBoard(){
  const b=Array(8).fill(null).map(()=>Array(8).fill(null));
  const back=["r","n","b","q","k","b","n","r"];
  for(let c=0;c<8;c++){
    b[0][c]={c:BLACK,t:back[c]}; b[1][c]={c:BLACK,t:"p"};
    b[6][c]={c:WHITE,t:"p"}; b[7][c]={c:WHITE,t:back[c]};
  }
  return b;
}
function cloneBoard(b){return b.map(r=>r.map(x=>x?{...x}:null))}
function cloneState(s){return {board:cloneBoard(s.board),turn:s.turn,castle:{...s.castle},ep:s.ep?{...s.ep}:null,half:s.half,full:s.full,last:s.last?{...s.last}:null}}
function newState(){return {board:initialBoard(),turn:WHITE,castle:{wK:true,wQ:true,bK:true,bQ:true},ep:null,half:0,full:1,last:null}}
function inside(r,c){return r>=0&&r<8&&c>=0&&c<8}
function enemy(color){return color===WHITE?BLACK:WHITE}
function sq(r,c){return String.fromCharCode(97+c)+(8-r)}
function addChat(text,type="bot"){const d=document.createElement("div");d.className="msg "+type;d.textContent=text;chatEl.appendChild(d);chatEl.scrollTop=chatEl.scrollHeight}
function pieceName(p){return ({p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"})[p.t]}
function moveText(m,b){return `${sq(m.r,m.c)}-${sq(m.toR,m.toC)}`}


function formatClock(seconds){
  seconds=Math.max(0,Math.ceil(seconds));
  const m=Math.floor(seconds/60), s=seconds%60;
  return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}
function updateClockUI(){
  youTimeEl.textContent=formatClock(clocks.w);
  botTimeEl.textContent=formatClock(clocks.b);
  youClockEl.classList.toggle("active",state && state.turn===WHITE && !gameFinished);
  botClockEl.classList.toggle("active",state && state.turn===BLACK && !gameFinished);
  for(const [el,val] of [[youClockEl,clocks.w],[botClockEl,clocks.b]]){
    el.classList.toggle("low",val<=30&&val>10);
    el.classList.toggle("critical",val<=10);
  }
}
function stopClock(){
  if(clockInterval){clearInterval(clockInterval);clockInterval=null}
}
function startClock(){
  stopClock();
  lastClockTick=Date.now();
  clockInterval=setInterval(()=>{
    if(!state||gameFinished)return;
    const now=Date.now();
    const elapsed=(now-lastClockTick)/1000;
    lastClockTick=now;
    const side=state.turn;
    clocks[side]=Math.max(0,clocks[side]-elapsed);
    updateClockUI();
    if(clocks[side]<=0){
      gameFinished=true;botThinking=false;stopClock();
      statusEl.textContent=side===WHITE?"Time out — ChessBot wins!":"Time out — you win!";
      turnText.textContent="Game over";
      addChat(side===WHITE?"Your clock reached zero. ChessBot wins on time.":"My clock reached zero. You win on time.");
    }
  },100);
}
function resetClocks(){
  timeLimit=Number(timeControlEl.value);
  clocks={w:timeLimit,b:timeLimit};
  gameFinished=false;
  updateClockUI();
  startClock();
}

function render(){
  // Rebuild only the 64 squares. CSS owns the board dimensions, so rendering
  // cannot change the board's width/height between moves.
  boardEl.innerHTML="";
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const el=document.createElement("div");
    el.className="square "+((r+c)%2?"dark":"light");
    if(selected&&selected.r===r&&selected.c===c)el.classList.add("selected");
    if(state.last && ((state.last.r===r&&state.last.c===c)||(state.last.toR===r&&state.last.toC===c)))el.classList.add("last");
    const p=state.board[r][c];
    if(p){const span=document.createElement("span");span.className="piece";span.textContent=PIECES[p.c][p.t];el.appendChild(span)}
    if(r===7||c===0){const co=document.createElement("span");co.className="coord";co.textContent=r===7?sq(r,c)[0]:8-r;el.appendChild(co)}
    el.addEventListener("click",()=>clickSquare(r,c));
    boardEl.appendChild(el);
  }
  if(selected){
    const legal=legalMoves(state,state.turn).filter(m=>m.r===selected.r&&m.c===selected.c);
    for(const m of legal){
      const idx=m.toR*8+m.toC, el=boardEl.children[idx];
      el.classList.add("legal");
      if(state.board[m.toR][m.toC] || m.epCapture)el.classList.add("capture");
    }
  }
  const inCheck=isInCheck(state,state.turn);
  const moves=legalMoves(state,state.turn);
  if(!moves.length){
    statusEl.textContent=inCheck?`${state.turn===WHITE?"You":"ChessBot"} is checkmated!`:"Stalemate — draw.";
    turnText.textContent="Game over";
  }else{
    statusEl.textContent=inCheck?`${state.turn===WHITE?"Your":"Bot's"} king is in check.`:`${state.turn===WHITE?"Your":"ChessBot's"} turn.`;
    turnText.textContent=state.turn===WHITE?"Your turn":"ChessBot thinking";
  }
}

function clickSquare(r,c){
  if(botThinking||state.turn!==WHITE||gameOver()||gameFinished)return;
  const p=state.board[r][c];
  if(selected){
    const moves=legalMoves(state,WHITE).filter(m=>m.r===selected.r&&m.c===selected.c);
    const move=moves.find(m=>m.toR===r&&m.toC===c);
    if(move){makeMove(state,move);selected=null;render();afterHumanMove();return}
    selected=p&&p.c===WHITE?{r,c}:null; render(); return;
  }
  if(p&&p.c===WHITE){selected={r,c};render()}
}

function gameOver(){const ms=legalMoves(state,state.turn);return ms.length===0}
function makeMove(s,m){
  const b=s.board, p=b[m.r][m.c], captured=m.epCapture?b[m.r][m.toC]:b[m.toR][m.toC];
  if(p.t==="p" && m.epCapture)b[m.r][m.toC]=null;
  b[m.r][m.c]=null;
  b[m.toR][m.toC]={...p};
  if(m.promotion)b[m.toR][m.toC].t=m.promotion;
  if(p.t==="k"){
    s.castle[p.c+"K"]=false;s.castle[p.c+"Q"]=false;
    if(Math.abs(m.toC-m.c)===2){
      const rookC=m.toC>m.c?7:0, rookTo=m.toC>m.c?5:3;
      b[m.toR][rookTo]=b[m.toR][rookC];b[m.toR][rookC]=null;
    }
  }
  if(p.t==="r"){
    if(m.r===7&&m.c===0)s.castle.wQ=false;if(m.r===7&&m.c===7)s.castle.wK=false;
    if(m.r===0&&m.c===0)s.castle.bQ=false;if(m.r===0&&m.c===7)s.castle.bK=false;
  }
  if(captured&&captured.t==="r"){
    if(m.toR===7&&m.toC===0)s.castle.wQ=false;if(m.toR===7&&m.toC===7)s.castle.wK=false;
    if(m.toR===0&&m.toC===0)s.castle.bQ=false;if(m.toR===0&&m.toC===7)s.castle.bK=false;
  }
  s.ep=null;
  if(p.t==="p"&&Math.abs(m.toR-m.r)===2)s.ep={r:(m.r+m.toR)/2,c:m.c};
  s.half=(p.t==="p"||captured)?0:s.half+1;
  if(p.c===BLACK)s.full++;
  s.last={...m};
  s.turn=enemy(s.turn);
  if(s===state) { lastClockTick=Date.now(); updateClockUI(); }
}
function pseudoMoves(s,color,attacksOnly=false){
  const out=[],b=s.board;
  const push=(r,c,tr,tc,extra={})=>{if(inside(tr,tc))out.push({r,c,toR:tr,toC:tc,...extra})};
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c]; if(!p||p.c!==color)continue;
    if(p.t==="p"){
      const dir=color===WHITE?-1:1, start=color===WHITE?6:1;
      for(const dc of [-1,1]){
        const tr=r+dir,tc=c+dc;
        if(inside(tr,tc)){
          if(b[tr][tc]&&b[tr][tc].c!==color)push(r,c,tr,tc,{epCapture:false});
          else if(s.ep&&s.ep.r===tr&&s.ep.c===tc)push(r,c,tr,tc,{epCapture:true});
        }
      }
      if(!attacksOnly){
        if(inside(r+dir,c)&&!b[r+dir][c]){
          push(r,c,r+dir,c);
          if(r===start&&!b[r+2*dir][c])push(r,c,r+2*dir,c);
        }
      }
    } else if(p.t==="n"){
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>addJump(r,c,dr,dc));
      function addJump(r,c,dr,dc){let tr=r+dr,tc=c+dc;if(!inside(tr,tc))return;if(!b[tr][tc]||b[tr][tc].c!==color)push(r,c,tr,tc)}
    } else if("brq".includes(p.t)){
      const dirs=[];
      if("bq".includes(p.t))dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if("rq".includes(p.t))dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      for(const [dr,dc] of dirs){let tr=r+dr,tc=c+dc;while(inside(tr,tc)){if(!b[tr][tc])push(r,c,tr,tc);else{if(b[tr][tc].c!==color)push(r,c,tr,tc);break}tr+=dr;tc+=dc}}
    } else if(p.t==="k"){
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;let tr=r+dr,tc=c+dc;if(inside(tr,tc)&&(!b[tr][tc]||b[tr][tc].c!==color))push(r,c,tr,tc)}
      if(!attacksOnly){
        const row=color===WHITE?7:0;
        if(r===row&&c===4&&!isInCheck(s,color)){
          if(s.castle[color+"K"]&&b[row][7]?.t==="r"&&!b[row][5]&&!b[row][6]&&!isSquareAttacked(s,row,5,enemy(color))&&!isSquareAttacked(s,row,6,enemy(color)))push(r,c,row,6,{castle:true});
          if(s.castle[color+"Q"]&&b[row][0]?.t==="r"&&!b[row][1]&&!b[row][2]&&!b[row][3]&&!isSquareAttacked(s,row,3,enemy(color))&&!isSquareAttacked(s,row,2,enemy(color)))push(r,c,row,2,{castle:true});
        }
      }
    }
  }
  // Promotion marker
  for(const m of out){
    const p=b[m.r][m.c];
    if(p&&p.t==="p"&&(m.toR===0||m.toR===7))m.promotion="q";
  }
  return out;
}
function isSquareAttacked(s,r,c,by){
  // Pawn attacks
  const pr=r+(by===WHITE?1:-1);
  for(const dc of [-1,1])if(inside(pr,c+dc)&&s.board[pr][c+dc]?.c===by&&s.board[pr][c+dc]?.t==="p")return true;
  const knights=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for(const [dr,dc] of knights)if(inside(r+dr,c+dc)&&s.board[r+dr][c+dc]?.c===by&&s.board[r+dr][c+dc]?.t==="n")return true;
  for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
    let rr=r+dr,cc=c+dc;while(inside(rr,cc)){const p=s.board[rr][cc];if(p){if(p.c===by&&(p.t==="b"||p.t==="q"))return true;break}rr+=dr;cc+=dc}
  }
  for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
    let rr=r+dr,cc=c+dc;while(inside(rr,cc)){const p=s.board[rr][cc];if(p){if(p.c===by&&(p.t==="r"||p.t==="q"))return true;break}rr+=dr;cc+=dc}
  }
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&inside(r+dr,c+dc)&&s.board[r+dr][c+dc]?.c===by&&s.board[r+dr][c+dc]?.t==="k")return true;
  return false;
}
function kingSquare(s,color){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(s.board[r][c]?.c===color&&s.board[r][c]?.t==="k")return [r,c];
  return null;
}
function isInCheck(s,color){const k=kingSquare(s,color);return k?isSquareAttacked(s,k[0],k[1],enemy(color)):true}
function legalMoves(s,color){
  const raw=pseudoMoves(s,color);
  const out=[];
  for(const m of raw){
    const t=cloneState(s);makeMove(t,m);
    if(!isInCheck(t,color))out.push(m);
  }
  return out;
}

function afterHumanMove(){
  if(gameOver()){
    render();
    announceGameEnd();
    return;
  }

  const humanMove = state.last ? {...state.last} : null;
  if(humanMove) addChat(`You played ${moveText(humanMove,state.board)}. My turn.`);

  botThinking=true;
  statusEl.textContent="ChessBot is thinking...";
  turnText.textContent="ChessBot thinking";
  render();

  // Short delay makes the bot feel responsive while still allowing the board to update.
  const selectedLevel=difficultyEl.value;
  setTimeout(()=>{
    if(gameFinished || state.turn!==BLACK){
      botThinking=false;
      render();
      return;
    }

    try{
      const level=difficultyEl.value;
      const moves=legalMoves(state,BLACK);

      if(!moves.length){
        botThinking=false;
        render();
        announceGameEnd();
        return;
      }

      let best=null;

      if(level==="easy"){
        // Easy: captures are preferred, otherwise random legal move.
        const captures=moves.filter(m=>{
          const target=m.epCapture ? state.board[m.r][m.toC] : state.board[m.toR][m.toC];
          return !!target;
        });
        const pool=(captures.length && Math.random()<0.75)?captures:moves;
        best=pool[Math.floor(Math.random()*pool.length)];
      }else{
        // Medium/Hard: ordered candidate search.
        transTable.clear();
        const depth=level==="medium"?2:3;
        let bestScore=-Infinity;

        const ordered=orderedMoves(state,moves);
        // Keep every move for correctness; hard mode has a strict response budget.
        const deadline=performance.now()+(level==="hard"?650:400);

        for(const m of ordered){
          if(best && performance.now()>deadline) break;

          const t=cloneState(state);
          makeMove(t,m);

          const score=-minimax(
            t,
            depth-1,
            -Infinity,
            Infinity,
            WHITE
          );

          if(score>bestScore){
            bestScore=score;
            best=m;
          }
        }

        // Safety fallback
        if(!best) best=ordered[0];
      }

      if(!best){
        botThinking=false;
        render();
        return;
      }

      const before=moveText(best,state.board);

      // IMPORTANT: perform the actual bot move on the live game state.
      makeMove(state,best);

      botThinking=false;
      render();

      addChat(`I play ${before}. ${commentForMove(best)}`);

      if(gameOver()){
        render();
        announceGameEnd();
      }
    }catch(err){
      console.error("ChessBot error:",err);
      botThinking=false;
      statusEl.textContent="ChessBot recovered from an internal error. Your turn.";
      turnText.textContent="Your turn";
      render();
      addChat("I had a small calculation error, but I recovered. Your turn.");
    }
  },levelDelay(selectedLevel));
}
function levelDelay(l){return l==="easy"?180:l==="medium"?260:350}
function shuffle(a){return [...a].sort(()=>Math.random()-.5)}

const transTable=new Map();
function positionKey(s){
  let k=s.turn+"|";
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=s.board[r][c]; k+=p?(p.c+p.t):".";
  }
  k+="|"+JSON.stringify(s.castle)+"|"+(s.ep?s.ep.r+","+s.ep.c:"-");
  return k;
}
function movePriority(s,m){
  const target=m.epCapture?s.board[m.r][m.toC]:s.board[m.toR][m.toC];
  const mover=s.board[m.r][m.c];
  let score=0;
  if(target)score+=10*VALUES[target.t]-VALUES[mover.t];
  if(m.promotion)score+=VALUES.q;
  if(m.castle)score+=40;
  return score;
}
function orderedMoves(s,moves){
  return moves.sort((a,b)=>movePriority(s,b)-movePriority(s,a));
}
function minimax(s,depth,alpha,beta,maxColor){
  const key=positionKey(s)+"|"+depth+"|"+maxColor;
  const cached=transTable.get(key);
  if(cached && cached.depth>=depth && cached.alpha<=alpha && cached.beta>=beta)return cached.value;
  const moves=legalMoves(s,s.turn);
  if(depth<=0||moves.length===0)return evaluateTerminal(s,moves,maxColor);
  let best=-Infinity;
  orderedMoves(s,moves);
  const alphaStart=alpha,betaStart=beta;
  for(const m of moves){
    const t=cloneState(s);makeMove(t,m);
    const val=-minimax(t,depth-1,-beta,-alpha,enemy(maxColor));
    if(val>best)best=val;
    alpha=Math.max(alpha,val);
    if(alpha>=beta)break;
  }
  transTable.set(key,{depth,value:best,alpha:alphaStart,beta:betaStart});
  if(transTable.size>50000)transTable.clear();
  return best;
}
function evaluateTerminal(s,moves,root){
  if(!moves.length){
    if(isInCheck(s,s.turn))return s.turn===root?-999999:999999;
    return 0;
  }
  return evaluate(s,root);
}
const pst={
 p:[0,5,5,-5,-5,5,10,0,0,10,-5,0,0,-10,10,0,5,-5,-10,0,0,5,5,5,0,0,0,20,20,0,0,0],
 n:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
 b:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
 q:[-20,-10,-10,0,0,-10,-10,-20,-10,0,0,5,5,0,0,-10,-10,0,5,5,5,5,5,0,-5,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,0,0,-10,-10,-20],
 r:[0,0,0,5,5,0,0,0,0,0,0,0,0,0,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,5,5,5,5,5,5,5,0,0,0,0,0,0,0,0],
 k:[20,30,10,0,0,10,30,20,20,20,0,0,0,0,20,20,-10,-20,-20,-20,-20,-20,-20,-10,-20,-30,-30,-40,-40,-30,-30,-20,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-30,-30,-30,-30,-30,-30,-30,-20,-20,-20,-20,-20,-20,-20,-20]
};
function evaluate(s,root){
  let score=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=s.board[r][c];if(!p)continue;
    let v=VALUES[p.t];
    let pos=pst[p.t]?.[p.c===WHITE?r*8+c:(7-r)*8+c]||0;
    score+=(p.c===root?1:-1)*(v+pos);
  }
  // mobility bonus
  const my=legalMoves(s,root).length, opp=legalMoves(s,enemy(root)).length;
  score+=(my-opp)*4;
  return score;
}
function commentForMove(m){
  const p=state.board[m.toR][m.toC];
  if(p?.t==="q")return "Queen move!";
  if(p?.t==="n")return "Knight deployed.";
  if(state.last?.castle)return "Castling completed.";
  if(m.epCapture)return "En passant!";
  return Math.random()<.5?"Your move.":"Let's see what you have next.";
}
function announceGameEnd(){
  gameFinished=true; stopClock();
  const loser=state.turn, check=isInCheck(state,loser);
  if(check){
    addChat(loser===WHITE?"Checkmate — ChessBot wins this game.":"Checkmate — you win!","bot");
  }else addChat("Stalemate — the game is a draw.","bot");
}
function reset(){
  state=newState();selected=null;history=[];botThinking=false;
  difficultyEl.disabled=false; timeControlEl.disabled=false;botLevelEl.textContent=difficultyEl.options[difficultyEl.selectedIndex].text;
  chatEl.innerHTML="";addChat("New game started. You are White. Your move.");
  resetClocks();
  render();
}
difficultyEl.addEventListener("change",()=>{
  botLevelEl.textContent=difficultyEl.options[difficultyEl.selectedIndex].text;
  addChat(`Difficulty changed to ${difficultyEl.options[difficultyEl.selectedIndex].text}. Start a new game to apply it cleanly.`);
});
timeControlEl.addEventListener("change",()=>{
  addChat(`Time control set to ${timeControlEl.options[timeControlEl.selectedIndex].text}. Start a new game to apply it.`);
});
newGameBtn.addEventListener("click",reset);
undoBtn.addEventListener("click",()=>{
  if(botThinking||history.length===0)return;
  // Restore to before the last human+bot turn where possible.
  const target=history.length>=2?history.length-2:history.length-1;
  state=cloneState(history[target]);
  history=history.slice(0,target);
  selected=null;
  // Restoring a turn also restores the configured starting clock for a clean undo.
  clocks={w:timeLimit,b:timeLimit}; gameFinished=false; startClock();
  render();addChat("Last turn undone; clocks reset for the restored position.");
});

// Save states before each human move.
const originalClick=clickSquare;
// Wrap move creation by observing state.last changes via a lightweight board snapshot.
// Easier: capture every state at turn transition.
const oldMakeMove=makeMove;
makeMove=function(s,m){
  if(s===state && s.turn===WHITE)history.push(cloneState(s));
  oldMakeMove(s,m);
};

reset();
