// EraControlPanel — 年代の表示と操作。
//
// ⚠ **peel3d.js から出した**（2026-08-22。hidetzu/konjaku#171）。⚠ **中身は移しただけ。**
//   ⚠ 関数・コメント・実測の記録は、⚠ **そのまま持ってきている**（掟: 古いコメントは資産）。
//   ⚠ 変えたのは**外への口だけ**（下の 4 つ）。
//     1 DOM は `root` の中から引く（`document.getElementById` を使わない）
//     2 段を進めるとき `input` を投げず、⚠ **`onChangeEra` で画面へ返す**（一方向）
//     3 幅の判断（`narrow`）と、⚠ **根拠を全画面で読んでいるか（`sealed`）は画面から受け取る**
//     4 明治期データの整備の有無（`meijiHas`）も画面から受け取る（⚠ 土地データを取りに行かない）
//
// ⚠ **境界（Owner 指定。hidetzu/konjaku#171）**
//   ```
//   × MapLibre を直接操作する   × 建物を調べる   × 土地データを取得する
//   × #land を書き換える        × URL を書き換える
//   ```
//   ⚠ 再生の間のカメラ送りは**画面の仕事**（`map.` が要る）。⚠ ここは ▶ の見た目と合図だけ。
//
// ⚠ **字は決めない。**⚠ 読み上げの文言は `words.js` が持ち、⚠ **ここは受け取って置くだけ。**
//
// 環境:
//   ブラウザ  <script src="./components/era-control/era-control.js"></script>
//             → globalThis.createEraControl
//   ⚠ **`public/sw.js` の SHELL に入れる。**⚠ 動的キャッシュの規則は `/^\/[\w.-]+\.js$/` で、
//     ⚠ **直下の .js しか一致しない。**⚠ 入れ忘れるとオフラインで年代 UI が出ない。
((g) => {
  "use strict";

  // ⚠ **自分で持つ。**⚠ 以前は `peel3d.js` が最上位で宣言した `esc` に、⚠ **黙って頼っていた。**
  //   ⚠ classic script は最上位の `const` を共有するので、⚠ **実物では動いてしまう。**
  //   ⚠ **単体では動かない。**⚠ コンポーネントだけで開いて初めて分かった（2026-08-22 に実測）。
  //   ⚠ **外の宣言に頼らない**（`.claude/rules/javascript.md`: 呼び出し元と依存先を見る）。
  const { esc } = g.KonjakuEsc;
  // ⚠ **字は自分で決めない。**⚠ 短い年の書き方は `words.js` が 1 か所で持つ
  //   （`.claude/rules/domain.md`: 言葉は 1 か所から借りる）。
  //   ⚠ **`esc` と同じで、⚠ 外の最上位宣言に頼らず、⚠ ここで名前を取る。**
  const { eraTick } = g.KonjakuWords;

  function createEraControl({ root, onChangeEra, onTogglePlay }) {
    if (!root) throw new Error("EraControl: root が無い");
    const q = (sel) => root.querySelector(sel);

    // ⚠ **自分の DOM だけ。**⚠ root の外を引かない
    const slider = q("#t");
    const trackEl = q("#track"), fillEl = trackEl.querySelector(".fill");
    const knobEl = trackEl.querySelector(".knob");
    const playBtn = q("#play");

    // ⚠ **画面から受け取る状態。**⚠ 自分で取りに行かない
    let steps = [], key = null, narrow = false, sealed = false, meijiHasNow = true;

    // ⚠ 端の文字は、目盛りの中心に置くと枠の外へ出る（中心そろえなので左右に半分ずつはみ出す）。
    //   9px のうちは偶然収まっていたが、読める大きさにしたら 375px で 3px はみ出した
    //   （実測 2026-08-15。横スクロールが出る）。端だけ内側へ寄せる印を付ける。
    //
    // ⚠ 目盛りは**地点ごとに引き直す**。段の数が場所によって変わるため
    //   （豊洲 9 段 / 広島 7 段 / 長崎 出島 4 段）。スライダーの上限も一緒に動かす。
    //   ⚠ .rail / .fill / .knob / <input> は消さない。消すと操作できなくなる。
    // ============================================================
    // 狭い幅の「ものさし」。⚠ **その地点の全段を 1 本の軸に常時描く。**
    //   直したかったのは「どこまで遡れるか分からない」ほう。実測（2026-08-19）:
    //   9 段のうち画面に入っていたのは 375 幅で 2 個・320 幅で 1 個だけだった。
    // ⚠ **右端はその地点の最終段。**「明治期」固定ではない（明治期データは 24 地点で 7/24）。
    // ⚠ **明治期は写真ではない**（低湿地データ）。刻みの形を変え、手前に仕切りを置く。
    // ⚠ **刻みは的にしない。**320 幅・9 段で 1 段 26.5px しかなく、44px を割る（掟）。
    // ============================================================
    const rulerEl=q("#ruler");
    const rlYear=q("#rlYear"), rlSub=q("#rlSub");
    const rlLeft=q("#rlLeft"), rlRight=q("#rlRight"), rlLabs=q(".rl-labs");
    const rlTicks=q("#rlTicks"), rlKnob=q("#rlKnob");
    const rlLine=q("#ruler .rl-line");
    const rlPrev=q("#rlPrev"), rlNext=q("#rlNext");
    const rlNote=q("#rlNote");

    // 段 k が軸のどこか（0..1）。⚠ 段の数が地点で変わるので、必ず steps から出す
    const rlAt=(k)=>steps.length<2?0:k/(steps.length-1);

    // ⚠ 狭い幅では、ものさし以外の操作部品を**到達できない**ようにする。
    //   display:none の親に入っていても、実装が変われば漏れる。⚠ **要素側でも閉じる。**
    //   実測（2026-08-19・320幅）: #timeToggle / #play / #t とドラムのボタン 9 個に
    //   ⚠ 見えないまま焦点が当たっていた（掟: 押しても何も起きない導線を置かない）。
    function sealOldControls(){
      const narrowNow=narrow;
      // ⚠ **幅ごとに、使わない側を閉じる。**片方だけ閉じると、もう片方で漏れる。
      //   ⚠ ドラムは**狭い幅の道具**なので、広い幅で閉じる。横棒・▶ はその逆。
      //   ⚠ **これは main からある漏れでもある**（実測 2026-08-19・PC でドラムのボタン 9 個に
      //     見えないまま焦点が当たっていた）。ものさしを入れるついでに、両側とも閉じる。
      const seal=(el,off)=>{ if(!el) return;
        // ⚠ inert は中の子まで一括で閉じる（ドラムのボタン 9 個もこれで閉じる）
        el.inert=off;
        if(off) el.setAttribute("aria-hidden","true"); else el.removeAttribute("aria-hidden"); };
      // ⚠ **狭い幅では #bar の中を全部使わない。**ものさしに差し替えたので、ドラムも使わない。
      //   （ドラムは 2026-08-18 に入れたが、2026-08-19 にものさしへ置き換えた）
      for(const el of [playBtn,slider,trackEl,drumEl]) seal(el,narrowNow||sealed);
      // ⚠ 広い幅ではドラムを使わない。**これは main からある漏れ**（実測 2026-08-19:
      //   PC でドラムのボタン 9 個に、見えないまま焦点が当たっていた）。ここで一緒に閉じる。
      if(!narrowNow) seal(drumEl,true);
      // ⚠ **「隠したまま開いていると名乗らせない」手当ては、要らなくなった**（2026-08-22）。
      //   ⚠ 畳みボタンそのものを消したので、⚠ **aria-expanded を持つ要素が無い。**
      // ⚠ **逆も閉じる。** PC ではものさしを出していないので、こちらを到達不能にする。
      //   片側だけ閉じると、広い幅で ‹ › とドラムのボタンに焦点が当たった（実測 2026-08-19）。
      seal(rulerEl,!narrowNow||sealed);
      // ⚠ **「根拠を全画面で読んでいるあいだ閉じる」は画面の判断**（`sealed` で受け取る）。
      //   ⚠ **ここは #panel を知らない**（hidetzu/konjaku#171 の境界）。
      //   ⚠ 画面側（peel3d.js）が #toggle / #land を閉じ、⚠ このコンポーネントには sealed を渡す。
    }

    function buildRuler(){
      sealOldControls();
      if(!rulerEl||!rlTicks) return;
      rlTicks.innerHTML="";
      steps.forEach((s,k)=>{
        const i=document.createElement("i");
        i.style.left=`${rlAt(k)*100}%`;
        // ⚠ 明治期は写真ではない。形を変える
        if(s.meiji) i.className="rl-meiji";
        rlTicks.appendChild(i);
        // ⚠ 写真の終わりに仕切り。**その手前**に置く（明治期の刻みと重ねない）
        if(s.meiji&&k>0){
          const cut=document.createElement("i");
          cut.className="rl-cut";
          cut.style.left=`${(rlAt(k)+rlAt(k-1))/2*100}%`;
          rlTicks.appendChild(cut);
        }
      });
      rlLeft.textContent=steps[0]?.label??"";
      rlRight.textContent=steps[steps.length-1]?.label??"";
      // ⚠ **間の段にも名前を置く**（2026-08-22。hidetzu/konjaku#166。Owner 判断）。
      //   ⚠ 前は両端しか名乗らず、⚠ **動かす前に「いつの年代が見られるか」が分からなかった**
      //     （実測 2026-08-22・375/344/320: 名前が読めるのは 2 個。刻みは 10 本）。
      //   ⚠ **間引かない。**⚠ 出ていない段があると「その年代は無い」と読まれる（掟 §1）。
      //   ⚠ **両端は軸の外（`#rlLeft` / `#rlRight`）が名乗る。**⚠ ここは間だけ。
      //     ⚠ 端まで軸の中に入れると、⚠ **`現在` がノブに重なり、320 幅で `明治` と接触する**
      //     （実測 2026-08-22。⚠ 画像で確かめた）。
      if(rlLabs){
        rlLabs.innerHTML="";
        steps.forEach((s,k)=>{
          if(k===0||k===steps.length-1) return;
          const t=document.createElement("span");
          t.textContent=eraTick(s.label);
          t.style.left=`${rlAt(k)*100}%`;
          rlLabs.appendChild(t);
        });
      }
      // ⚠ **できることから書く。**「写真はありません」で始めない（CLAUDE.md §4-1）
      const photo=steps.filter((s)=>!s.meiji);
      const hasMeiji=steps.some((s)=>s.meiji);
      // ⚠ 1 行に収める。2 行になると 34px 使い、地図が減る（実測 2026-08-19・320幅）。
      //   ⚠ 端のラベル（現在／明治期）が軸に出ているので、ここで年代を繰り返さない。
      //   ⚠ **できることから書く。**「写真はありません」で始めない（CLAUDE.md §4-1）。
      // ⚠ **「明治期は地図」と書けるのは、その土地に低湿地データがあるときだけ。**
      //   段は整備の有無に関わらず出る（main からの挙動）。⚠ **段があること＝データがある、ではない。**
      //   実測（2026-08-19・釧路）: 段は出るが、選ぶと「整備対象外です」と言う。
      //   ⚠ 注記だけが「明治期は地図」と約束してしまうと、軸が嘘をつく。
      // ⚠ **土地データを取りに行かない**（hidetzu/konjaku#171 の境界）。⚠ 画面から渡してもらう
      const meijiHas = meijiHasNow;
      rlNote.textContent=photo.length
        ? `空中写真 ${photo.length} 段`
          +(hasMeiji ? (meijiHas ? " ／ 明治期は地図" : " ／ 明治期はこの土地では未整備") : "")
        : "";
    }

    function syncRuler(){
      if(!rulerEl||!rlKnob) return;
      const pos=Number(slider.value)/100;
      rlKnob.style.left=`${Math.max(0,Math.min(1,steps.length<2?0:pos/(steps.length-1)))*100}%`;
      const k=Math.round(pos);
      const s=steps[Math.max(0,Math.min(steps.length-1,k))];
      // ⚠ **撮影種別は、年代の箱（`#era .s`）の 1 か所だけ**（2026-08-22。hidetzu/konjaku#165。Owner 判断 A）。
      //   ⚠ **狭い幅の分担は、もともとそう決まっていた**（`peel.html`: ⚠ 年を 2 か所に出さない。
      //     ものさしが年を答えるので、⚠ **年代の箱に残すのは「いま何の写真か」と、届かないときの名乗り**）。
      //   ⚠ ここが分担を破って、⚠ **撮影種別を 2 回目に出していた**
      //     （実測 2026-08-21・375×667: `#era .s` y=379 と ものさしの中 y=518 が、どちらも「最新の空中写真」）。
      //   ⚠ **空にすれば箱ごと消える**（`#rlSub:empty{display:none}`）。⚠ 年は今までどおり出す。
      if(s){ rlYear.textContent=s.label; rlSub.textContent=""; }
      rlPrev.disabled=pos<=0.001;
      rlNext.disabled=pos>=steps.length-1-0.001;
    }

    // ⚠ ＜＞ は 1 段ずつ。⚠ 軸のドラッグは連続（じわじわ変わる体験を残す）
    const rlStep=(d)=>{
      const k=Math.max(0,Math.min(steps.length-1,Math.round(Number(slider.value)/100)+d));
      setStep(k);
    };
    rlPrev?.addEventListener("click",()=>rlStep(-1));
    rlNext?.addEventListener("click",()=>rlStep(1));
    // ⚠ 軸そのものが指の面。刻みは的にしない（26.5px は 44px を割る）
    let rlDrag=false;
    const rlFromX=(x)=>{
      const r=rlLine.getBoundingClientRect();
      const t=Math.max(0,Math.min(1,(x-r.left)/Math.max(1,r.width)));
      slider.value=String(t*(steps.length-1)*100);
      // ⚠ **input を投げない。**⚠ 画面へ返す（一方向）
      onChangeEra?.(t*(steps.length-1));
    };
    rlLine?.addEventListener("pointerdown",(e)=>{ rlDrag=true; rlLine.setPointerCapture(e.pointerId); rlFromX(e.clientX); });
    rlLine?.addEventListener("pointermove",(e)=>{ if(rlDrag) rlFromX(e.clientX); });
    for(const ev of ["pointerup","pointercancel"]) rlLine?.addEventListener(ev,()=>{ rlDrag=false; });

    function buildTicks(){
      trackEl.querySelectorAll(".tick,.lab").forEach((el)=>el.remove());
      const n=steps.length-1;
      steps.forEach((s,k)=>{
        const pc=k/n*100;
        const edge=k===0?" at-start":k===n?" at-end":"";
        // ⚠ **両端は必ず出す。** 中間は狭い画面で密集するので1つおきに間引くが、
        //   端まで間引くと「このつまみを端まで送ると何になるのか」が読めなくなる。
        //   段が固定 9 段だった頃は両端が k=0 と k=8 でどちらも偶数だったため、
        //   `k%2===0` だけで**たまたま**成立していた。段数が地点ごとに変わるいまは、
        //   長崎 出島（4 段）で終端が k=3 になり、「明治期」が空欄になっていた。
        const show=k===0||k===n||k%2===0;
        trackEl.insertAdjacentHTML("beforeend",
          `<div class="tick" data-i="${k}" style="left:${pc}%"></div>
           <div class="lab${edge}" data-i="${k}" style="left:${pc}%">${show?s.label:""}</div>`);
      });
      // スライダーの目盛りと上限を、段の数に合わせる（1段 = 100）
      slider.max=String(n*100);
      if(Number(slider.value)>n*100) slider.value=String(n*100);
      buildDrum();
    }

    // ============================================================
    // 横ドラムロール（狭い幅）
    //   段を横に並べ、指で回して真ん中で選ぶ。
    // ⚠ **値の正本は #t のまま。**ここは #t を動かすだけ。▶ もカメラも #t を見ている。
    //   別に値を持つと、再生中とドラム操作で答えが割れる（掟: 同じ問いに答える実装を2つ持たない）。
    // ⚠ 横棒では狭くて 4 段の名前を消していたが、ここは横スクロールなので**全段に名前を出す**。
    //   実測（2026-08-18）: 段は 9 つあり、**全部に名前はあった**（表示で間引いていただけ）。
    // ============================================================
    const drumEl=q("#drum");
    let drumSelf=false, drumTimer=null;
    function buildDrum(){
      if(!drumEl) return;
      drumEl.innerHTML=steps.map((s,k)=>
        `<button class="d-it" type="button" data-i="${k}">${esc(s.label)}</button>`).join("");
      // 全体のどこにいるかの点。⚠ 押せない（位置を知らせるだけ）
      const pos=q("#drumPos");
      if(pos) pos.innerHTML=steps.map(()=>"<i></i>").join("");
      // 文字を押しても選べる（回すのが苦手な人の逃げ道）
      drumEl.querySelectorAll(".d-it").forEach((b)=>{
        b.onclick=()=>setStep(Number(b.dataset.i));
      });
      syncDrum(true);
    }
    // 段を選ぶ。⚠ #t を動かして input を投げる（既存の経路に一本化する）
    function setStep(k){
      const v=Math.max(0,Math.min(steps.length-1,k))*100;
      if(Number(slider.value)===v) return;
      slider.value=String(v);
      // ⚠ **input を投げない。**⚠ 画面へ返して、画面が描き直す（一方向。hidetzu/konjaku#171）
      onChangeEra?.(v/100);
    }
    // いまの値に合わせてドラムを寄せる。⚠ 自分で動かしている間は scroll を聞き返さない
    function syncDrum(instant){
      if(!drumEl||!drumEl.offsetParent) return;      // PC（display:none）では何もしない
      const it=drumEl.querySelectorAll(".d-it");
      if(!it.length) return;
      const pos=Number(slider.value)/100;
      const i=Math.max(0,Math.min(it.length-1,Math.round(pos)));
      it.forEach((b,k)=>b.classList.toggle("on",k===i));
      q("#drumPos")?.querySelectorAll("i")
        .forEach((d,k)=>d.classList.toggle("on",k===i));
      // ⚠ 連続値（再生中）でも追えるよう、段と段の間を按分する
      const a=it[Math.floor(pos)]??it[i], b2=it[Math.ceil(pos)]??it[i];
      const f=pos-Math.floor(pos);
      const cx=(a.offsetLeft+a.offsetWidth/2)*(1-f)+(b2.offsetLeft+b2.offsetWidth/2)*f;
      const want=Math.round(cx-drumEl.clientWidth/2);
      if(Math.abs(drumEl.scrollLeft-want)<1) return;
      drumSelf=true;
      drumEl.scrollTo({left:want,behavior:instant?"auto":"smooth"});
      clearTimeout(drumTimer);
      drumTimer=setTimeout(()=>{ drumSelf=false; },260);
    }
    // 指で回したら、真ん中に来た段を選ぶ
    let drumStill=null;
    drumEl?.addEventListener("scroll",()=>{
      if(drumSelf) return;
      clearTimeout(drumStill);
      // ⚠ 止まってから決める。動いている途中で決めると、通り過ぎた段を全部選ぶことになる
      drumStill=setTimeout(()=>{
        const it=drumEl.querySelectorAll(".d-it");
        if(!it.length) return;
        const c=drumEl.scrollLeft+drumEl.clientWidth/2;
        let best=0,bd=Infinity;
        it.forEach((b,k)=>{ const d=Math.abs(b.offsetLeft+b.offsetWidth/2-c);
          if(d<bd){bd=d;best=k;} });
        setStep(best);
      },90);
    });
    // ⚠ **初期化は update() で走る**（画面が段を渡してから）。⚠ ここで先に描かない

    // ⚠ **帯の見た目**（塗り・ノブ・目盛りの強調）。⚠ peel3d.js の paint() から移した。
    //   ⚠ **式は 1 文字も変えていない**（`pos/nPhoto*100`。`nPhoto` は `steps.length-1`）。
    function syncTrack(pos){
      const nPhoto=steps.length-1;
      const pc=pos/nPhoto*100;
      fillEl.style.width=pc+"%"; knobEl.style.left=pc+"%";
      const selected=Math.max(0,Math.min(steps.length-1,Math.round(pos)));
      trackEl.querySelectorAll(".tick").forEach((el)=>{
        const k=Number(el.dataset.i);
        el.classList.toggle("on",k<=pos+.5);
        el.classList.toggle("selected",k===selected);
      });
      trackEl.querySelectorAll(".lab").forEach((el)=>
        el.classList.toggle("selected",Number(el.dataset.i)===selected));
      // ⚠ ものさしも同じ周期で追う。触るのは 2 つの要素だけ（つまみの位置と年）
      syncRuler();
    }

    // 端の年代ラベルは、見た目の中心が range の最大・最小位置からずれる。
    // そのまま押すと「明治期」と表示されても値が最大に届かず、場面が切り替わりきらないため、
    // 文字を押したときは、その段を明示的に選ぶ。
    //
    // ⚠ **既定動作を止めない。** 以前は文字だけ pointer-events:auto にして pointerdown を
    //   preventDefault/stopPropagation していたが、そうすると range がドラッグを始めないので、
    //   **文字の上から引いても値がその段に貼り付いて動かなかった**
    //   （実測 2026-08-16・375×667・豊洲: 右へ 120px 引いて 200 → 200 → 200 …。
    //    ノブの上・レールの上からは連続して動いていた）。
    //   そこで、押した点がどの文字の箱の中かだけを覚えておき、
    //   **ほとんど動かずに離したとき**＝タップのときだけ、その段へ寄せる。
    // ⚠ 引いた結果は寄せない。引き終えてから段へ吸うと、指を離した瞬間に値が飛ぶ。
    const TAP_SLOP=6;         // これ以下の移動はタップ。指で押すと数 px は動く
    let labFrom=null;
    // ⚠ 文字は pointer-events:none なので e.target には出てこない。箱で当てる。
    //   文字を間引いた（空の）ラベルは的にしない（押しても何が選ばれたのか読めない）
    // ⚠ **重なったときは、中心がいちばん近いものを選ぶ。**
    //   箱を指の大きさ（44px）まで広げたら、狭い画面で隣と重なった。
    //   DOM の順に最初の1つを返していたので、320×640 で「明治期」を押すと
    //   手前の「1945–50」が当たり、**値が 600 で止まった**（実測 2026-08-18）。
    //   ⚠ 重なりを消す方向では直せない。320px では文字の間隔が 55px しかなく、
    //     「1984–86」の字だけで 53px ある。**重なる前提で、境目を中点に置く。**
    const labAt=(x,y)=>{
      let best=null, bestD=Infinity;
      for(const el of trackEl.querySelectorAll(".lab")){
        if(!el.textContent.trim()) continue;
        const r=el.getBoundingClientRect();
        if(x<r.left||x>r.right||y<r.top||y>r.bottom) continue;
        const d=Math.abs(x-(r.left+r.right)/2);
        if(d<bestD){ bestD=d; best=el; }
      }
      return best;
    };
    trackEl.addEventListener("pointerdown",(e)=>{
      const mark=labAt(e.clientX,e.clientY);
      const k=mark?Number(mark.dataset.i):NaN;
      labFrom=Number.isFinite(k)?{x:e.clientX,y:e.clientY,k}:null;
    });
    trackEl.addEventListener("pointerup",(e)=>{
      const f=labFrom; labFrom=null;
      if(!f) return;
      if(Math.hypot(e.clientX-f.x,e.clientY-f.y)>TAP_SLOP) return;   // 引いた。連続移動の結果を残す
      slider.value=String(f.k*100);
      // ⚠ **input を投げない。**⚠ 画面へ返す（一方向。hidetzu/konjaku#171）
      onChangeEra?.(f.k);
    });
    // 押しかけたまま取り消されたものを、次の操作へ持ち越さない
    trackEl.addEventListener("pointercancel",()=>{ labFrom=null; });
    trackEl.addEventListener("pointercancel",()=>{ labFrom=null; });

    // ⚠ **既定動作を止めない。**range のドラッグはブラウザに任せ、値だけ画面へ返す
    slider.addEventListener("input", () => onChangeEra?.(Number(slider.value) / 100));
    playBtn.addEventListener("click", () => onTogglePlay?.());

    // ---- 画面から受け取る、ただ 1 つの口 ----
    // ⚠ **渡されたものだけを描く。**⚠ 取りに行かない。
    function update(s) {
      const nextSteps = s.steps ?? [];
      const nextKey = nextSteps.map((x) => `${x.id}:${x.label}:${x.meiji ? 1 : 0}`).join("|");
      // ⚠ **段の並びが変わったかは、中身で見る。**⚠ 参照で見ると、
      //   同じ内容を作り直しただけで目盛りを引き直すことになる（地点ごとに毎回起きる）
      const rebuilt = nextKey !== key;
      steps = nextSteps; key = nextKey;
      narrow = !!s.narrow; sealed = !!s.sealed;
      meijiHasNow = s.meijiHas !== false;
      const pos = Math.max(0, Math.min(Math.max(0, steps.length - 1), s.pos ?? 0));
      slider.value = String(pos * 100);
      if (rebuilt) buildTicks();          // ⚠ buildTicks が buildDrum を呼ぶ（原本のまま）
      buildRuler();                       // ⚠ 注記は整備の有無で変わる。幅が変わっても引き直す
      if (steps.length) { syncTrack(pos); syncDrum(rebuilt); }

      // ⚠ **読み上げの字は words.js が決める。**⚠ ここは受け取って置くだけ
      const r = s.readout ?? {};
      q(".y").textContent = r.year ?? "";
      q(".kick").textContent = r.kick ?? "";
      q(".s").textContent = r.sub ?? "";
      const net = q(".era-net"); if (net) net.textContent = r.net ?? "";
      const note = q("#eraSummaryNote"); if (note) note.textContent = r.note ?? "";
      slider.setAttribute("aria-valuetext", r.year ?? "");

      const t = s.tone ?? {};
      root.classList.toggle("waiting", !!t.waiting);
      root.classList.toggle("failed", !!t.failed);
      root.classList.toggle("meiji", !!t.meiji);
      trackEl.classList.toggle("meiji", !!t.meiji);

      // ⚠ 記号だけを差し替える。⚠ **名乗りは aria に残す**
      playBtn.textContent = s.playing ? "❚❚" : "▶";
      playBtn.setAttribute("aria-pressed", String(!!s.playing));
    }

    return { update, root };
  }

  g.createEraControl = createEraControl;
})(typeof window === "undefined" ? globalThis : window);
