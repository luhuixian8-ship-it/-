/* 好好吃饭 · 第一步：逐条核对 AI 识别结果（前端补丁） */
(function () {
  const CUSTOM_KEY = 'fridge_custom_ingredients_v1';
  const loadCustom = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
      if (!Array.isArray(stored)) return;
      for (const n of stored) {
        if (typeof n !== 'string' || !n.trim() || names[n]) continue;
        const ing = {n, c:'自定义', u:'meal', a:['未确认'], aliases:[], ref:1};
        D.ingredients.push(ing);
        names[n] = ing;
      }
    } catch (_) { /* 无效历史记录不阻断应用 */ }
  };
  loadCustom();

  const cleanName = name => String(name || '').trim().replace(/\s+/g, ' ');
  const findKnown = value => {
    const needle = cleanName(value).replace(/\s+/g,'');
    return D.ingredients.find(x => x.n === needle || (x.aliases || []).includes(needle)) || null;
  };
  const suspicious = value => /[?？()（）/\[\]【】、，,；;]|疑似|可能|类似|其他|不明|未知|内容物|非食材|包装|如.*等|^碗$|^锅$|^袋$/.test(value);
  const safeText = v => esc(String(v ?? ''));

  function reviewCard(item, index, total) {
    const text = safeText(item.draft ?? item.raw);
    const hint = item.matched ? `匹配到食材库：${safeText(item.matched)}` : '未匹配到食材库：请把名称改成具体食材';
    const options = D.ingredients.filter(x => x.u !== 'boolean').map(x => `<option value="${safeText(x.n)}"></option>`).join('');
    return `<div class="card narrow" style="margin-top:18px" aria-live="polite">
      <div class="hrow"><h3>核对第 ${index + 1} / ${total} 项</h3><span class="sub">一次确认一种，不确定就删除</span></div>
      <p class="sub">AI 原始识别：<strong>${safeText(item.raw)}</strong></p>
      <label style="display:block;margin:12px 0 8px;font-weight:600" for="review-name">食材名称（可以修改）</label>
      <input class="search" style="width:100%" id="review-name" list="review-known-ingredients" value="${text}" placeholder="例如：包菜、白萝卜" oninput="state.scanItems[${index}].draft=this.value" />
      <datalist id="review-known-ingredients">${options}</datalist>
      <p class="sub" style="margin-top:8px">${hint}。不确定具体是什么，请删除，不要猜测。</p>
      <div class="actions" style="margin-top:15px">
        <button class="btn" onclick="reviewConfirm(${index})">确认这一项 →</button>
        <button class="btn secondary" onclick="reviewReject(${index})">删除这一项</button>
      </div>
    </div>`;
  }

  scan = function () {
    const entries = state.scanItems || [];
    const pendingIndex = entries.findIndex(x => x.status === 'pending');
    const approved = entries.filter(x => x.status === 'approved');
    const done = entries.filter(x => x.status && x.status !== 'pending').length;
    const list = approved.map((x, i) => {
      const sourceIndex = entries.indexOf(x);
      const isCount = names[x.n]?.u === 'count';
      return `<div class="list-row"><div class="small-emoji">${emoji(x.n)}</div>
       <div class="grow"><b>${safeText(x.n)}</b><small>${x.custom ? '自定义 · 过敏原未核验 · 不参与推荐' : '已确认'} · ${isCount ? '按个数' : '按一人份可吃几顿'}</small></div>
       <div class="qty"><button onclick="scanQty(${sourceIndex},-1)">−</button><strong>${x.qty}</strong><button onclick="scanQty(${sourceIndex},1)">+</button></div>
       <button class="btn secondary small" onclick="reviewReject(${sourceIndex})">删除</button></div>`;
    }).join('');
    return header('拍一下冰箱，看看有什么','照片交给在线视觉 AI 识别；逐条核对后才会加入库存。') + `
      <div class="card narrow"><h3>① 选择照片</h3><p class="sub">选一张清晰的冰箱照片，AI 可能识别错误或漏掉被遮挡的食材。</p>
      <div class="toolbar"><input type="file" id="scan-file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" onchange="previewScan(this)" style="max-width:100%"></div>
      ${state.scanImage ? `<img src="${state.scanImage}" alt="待识别的冰箱照片" style="max-width:100%;max-height:280px;object-fit:contain;border-radius:16px">` : ''}
      <div class="actions" style="margin-top:14px"><button class="btn" onclick="recognizePhoto()" ${state.scanBusy ? 'disabled' : ''}>${state.scanBusy ? '正在识别，请稍候…' : '识别照片里的食材'}</button></div>
      ${state.scanError ? `<div class="notice" role="alert">${safeText(state.scanError)}</div>` : ''}</div>
      ${entries.length ? `<div class="card narrow" style="margin-top:18px"><h3>② 识别结果 · ${done}/${entries.length} 项已处理</h3><p class="sub">确认、改名或删除每一项。不会自动把不确定食材加入库存。</p></div>` : ''}
      ${pendingIndex >= 0 ? reviewCard(entries[pendingIndex],pendingIndex,entries.length) : ''}
      ${entries.length && pendingIndex < 0 ? `<div class="card narrow" style="margin-top:18px"><h3>③ 已确认 ${approved.length} 项食材</h3>${list || '<p class="sub">没有要加入的食材。</p>'}
         <div class="actions" style="margin-top:18px"><button class="btn secondary" onclick="nav('pantry')">手动补充漏识别</button>
         <button class="btn" onclick="acceptScan()" ${!approved.length ? 'disabled' : ''}>将已确认食材加入冰箱 →</button></div></div>` : ''}
      <div class="notice">提示：AI 识别的是食材候选名称，不是可靠数量。未收录的新食材可保存为自定义，但过敏原未核验前不参与菜谱推荐。</div>`;
  };

  recognizePhoto = async function () {
    if (!currentScanFile || !state.scanImage) {state.scanError='请先选择一张照片';render();return;}
    if (state.scanBusy) return;
    state.scanBusy=true;
    state.scanError='';
    state.scanItems=[];
    render();
    try {
      const response=await fetch('/api/recognize',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({image:state.scanImage}),signal:AbortSignal.timeout(65000)
      });
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || '识别请求失败');
      const candidates=Array.isArray(data.items) ? data.items : [];
      const seen=new Set();
      for (const item of candidates.slice(0,40)) {
        if(typeof item?.name!=='string')continue;
        const raw=cleanName(item.name);
        if(!raw || seen.has(raw))continue;
        seen.add(raw);
        const match=findKnown(raw);
        state.scanItems.push({raw,n:match?.n||raw,draft:match?.n||raw,matched:match?.n||null,qty:1,custom:!match,status:'pending'});
      }
      if(!state.scanItems.length)state.scanError='模型没有返回可核对的食材，请手动补充或换一张照片。';
      log('photo_recognition',{modelReturned:candidates.length,displayed:state.scanItems.length});
    } catch(err) {state.scanError='识别失败：'+(err.message||err);} finally {state.scanBusy=false;render();}
  };

  reviewConfirm = function (i) {
    const item=state.scanItems?.[i];if(!item || item.status!=='pending')return;
    const value=cleanName(document.getElementById('review-name')?.value || item.draft);
    if(!value || value.length>20 || suspicious(value)) {
      state.scanError='请把当前名称修改为明确的单一食材，例如“包菜”，不要使用“疑似”“其他”“碗”等描述。';
      render();return;
    }
    const known=findKnown(value);
    if(known?.u==='boolean') {state.scanError='这是常备调料，请到库存页核对。';render();return;}
    item.n=known?.n || value;
    item.custom=!known;
    item.status='approved';
    item.qty=1;
    state.scanError='';
    render();
  };
  reviewReject = function (i) {
    const item=state.scanItems?.[i];if(!item)return;
    item.status='rejected';state.scanError='';render();
  };
  scanQty = function (i,d) {
    const item=state.scanItems?.[i];if(!item || item.status!=='approved')return;
    const step=names[item.n]?.u==='count' ? 1 : 0.5;
    item.qty=Math.max(step,Math.min(9,Math.round((item.qty+d*step)*2)/2));render();
  };
  acceptScan = function () {
    const approved=(state.scanItems||[]).filter(x=>x.status==='approved');
    if (!approved.length) {toast('没有已确认的食材');return;}
    const customNames=[];
    for(const x of approved) {
      if(x.custom && !names[x.n]) {
        const ingredient={n:x.n,c:'自定义',u:'meal',a:['未确认'],aliases:[],ref:1};
        D.ingredients.push(ingredient);names[x.n]=ingredient;customNames.push(x.n);
      }
      state.inventory[x.n]=Math.min(9,(state.inventory[x.n]||0)+x.qty);
    }
    if(customNames.length){
      try {
        const previous=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');
        localStorage.setItem(CUSTOM_KEY,JSON.stringify([...new Set([...(Array.isArray(previous)?previous:[]),...customNames])]));
      }catch(_){toast('自定义食材的本地保存失败，请稍后检查库存');}
    }
    log('photo_confirmed',{names:approved.map(x=>x.n),custom:customNames});
    state.scanItems=[];state.scanImage='';currentScanFile=null;
    persist();nav('confirm');toast('已加入库存，请核对数量');
  };
  render();
})();
