/* 好好吃饭 · 动态最少菜数营养覆盖推荐 + 其余菜谱按食物类别分组
   加载在 index.html 主脚本和 ingredient-review-patch.js 之后。
   原有 candidate() 对食材、过敏、忌口、厨具、时间的过滤保持不变。
   注意：食物类别覆盖不等于营养素/份量达标。
*/
(function () {
  const G = ['主食', '蔬菜', '蛋白质'];
  // 薯类及部分淀粉类蔬菜在此产品的“主食来源”视角中归入主食；
  // 南瓜、莲藕不直接等同谷薯主食，避免把少量配菜当成一份主食。
  const STARCH = new Set(['土豆', '红薯', '山药', '芋头', '玉米']);
  const PROTEIN = new Set(['鸡蛋','豆腐','嫩豆腐','千张','鸡胸肉','鸡腿肉','猪肉','猪里脊','牛肉','牛肉末','虾仁','鱼片','三文鱼']);
  const PROCESSED = new Set(['培根','火腿','香肠']);
  const VEGETABLE_STARCH = new Set(['土豆', '红薯', '山药', '芋头', '玉米']);
  function groups(r) {
    const found = new Set();
    // 只看实际使用的主要食材，不能把调料、极少量配菜算成一类营养贡献。
    for (const n of r.main) {
      const c = names[n]?.c;
      if (c === '主食' || STARCH.has(n)) found.add('主食');
      if (c === '蔬菜' && !VEGETABLE_STARCH.has(n)) found.add('蔬菜');
      if (PROTEIN.has(n) || (c === '肉禽海鲜' && !PROCESSED.has(n))) found.add('蛋白质');
    }
    return found;
  }
  const count = s => s.size;
  function pickTop(sorted) {
    const remaining = [...sorted];
    const top = [], covered = new Set();
    for (let i = 0; i < 3 && remaining.length && covered.size < 3; i++) {
      let bestIndex = -1, bestGain = 0;
      remaining.forEach((r, index) => {
        const gain = [...groups(r)].filter(g => !covered.has(g)).length;
        // 排序靠前的菜在相同新增覆盖数下胜出。
        if (gain > bestGain) { bestGain = gain; bestIndex = index; }
      });
      if (bestIndex < 0) break; // 没有任何新增类别，就不凑 Top 2 / Top 3。
      const r = remaining.splice(bestIndex, 1)[0];
      top.push(r);
      groups(r).forEach(g => covered.add(g));
    }
    return {top, covered};
  }
  recommend = function () {
    const list = D.recipes.map(candidate).filter(Boolean).filter(r =>
      r.heat <= state.prefs.heat || (r.heat > state.prefs.heat && r.sp.includes('辣椒') && !r.main.includes('辣椒'))
    );
    list.sort((a,b) => b.utilization-a.utilization || a.changes.length-b.changes.length || a.steps.length-b.steps.length || a.t-b.t);
    const {top, covered} = pickTop(list);
    const ids = new Set(top.map(r => r.id));
    const rest = list.filter(r => !ids.has(r.id));
    return {top, rest, covered, total:list.length};
  };
  const style = document.createElement('style');
  style.textContent = `
    .nutri-feature{border:2px solid #d7b264;box-shadow:0 10px 28px rgba(88,68,31,.10)}
    .nutri-award{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#fff0c7;color:#664410;border-radius:999px;font-size:14px;font-weight:800}
    .nutri-groups{font-size:12px;color:#45624c}
    .nutri-feature .art{background:#f9f0d8}
    .nutri-section{margin-top:30px}
    .nutri-note{color:var(--muted);line-height:1.7;font-size:13px;margin:7px 0 16px}
    .nutri-card-label{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:9px}
  `;
  document.head.appendChild(style);
  function card(r, index, featured) {
    const tags = [...groups(r)].join(' · ') || '其他';
    return `<div class="card recipe ${featured?'nutri-feature':''}">
      <div class="art" aria-hidden="true">${recipeIcon(r)}</div>
      <div class="recipe-body">
        <div class="nutri-card-label">
          ${featured?`<span class="nutri-award">🏆 TOP ${index+1}</span>`:'<span class="tag">符合条件</span>'}
          <span class="nutri-groups">${esc(tags)}</span>
        </div>
        <h3>${esc(r.n)}</h3>
        <div class="meta"><span>◷ ${r.t} 分钟</span><span>♨ ${esc(r.tool)}</span><span>♧ ${r.used.filter(n=>!seasonNames.has(n)).length} 种食材</span></div>
        <p>${r.changes.length?`需要 ${r.changes.length} 处食材调整。`:'原料齐全。'}${r.steps.length} 个步骤。</p>
        ${btn('查看改良食谱 →',`openRecipe(${r.id})`)}
      </div>
    </div>`;
  }
  // 不重复列同一道菜：多类别菜谱单独分组，其余按主食/蔬菜/蛋白质/其他分组。
  function restCategory(r) {
    const g = groups(r);
    if (g.size >= 2) return '复合搭配';
    if (g.size === 1) return [...g][0];
    return '其他';
  }
  results = function () {
    const {top, rest, covered, total} = recommend();
    logOnce('matching_executed', String(total)+':'+top.map(x=>x.id).join(','));
    const missing = G.filter(g => !covered.has(g));
    let notice = '';
    if (top.length) {
      notice = missing.length
        ? `<div class="notice">当前可做菜谱尚无法覆盖：${esc(missing.join('、'))}。请补充对应食材；系统不会为了凑满 3 道而推荐不符合条件的菜。</div>`
        : `<div class="notice success">推荐组合已覆盖主食、蔬菜和蛋白质来源，共需 ${top.length} 道菜。食物类别覆盖不等于营养摄入量达标；请结合实际份量选择。</div>`;
    }
    const categories = ['复合搭配','主食','蔬菜','蛋白质','其他'];
    const titles = {'复合搭配':'多类别搭配','主食':'主食类','蔬菜':'蔬菜类','蛋白质':'蛋白质来源类','其他':'其他菜谱'};
    const restHTML = categories.map(category => {
      const items = rest.filter(r => restCategory(r) === category);
      if (!items.length) return '';
      return `<section class="nutri-section">${sectionTitle(titles[category],`${items.length} 道`)}<div class="recipes">${items.map((r,i)=>card(r,i,false)).join('')}</div></section>`;
    }).join('');
    return header('你的今晚菜单','先用尽量少的菜谱覆盖主要食物类别，再按类别浏览其他选择。')+
      `<div class="notice success">已按厨具、30 分钟上限、过敏/忌口、主料齐备及最多 2 处调整过滤。${state.prefs.allergy.length?'已排除过敏原：'+esc(state.prefs.allergy.join('、'))+'。':''}</div>`+
      sectionTitle('🏆 今日优选组合',`共 ${total} 道符合条件`)+
      '<p class="nutri-note">优先选一份同时有主食、蔬菜和蛋白质来源的菜；如有缺项，后续推荐只补未覆盖类别，最多三道。排名是推荐顺序，并非营养质量认证。</p>'+
      notice+
      (top.length ? `<div class="recipes">${top.map((r,i)=>card(r,i,true)).join('')}</div>` : '<div class="empty">目前没有符合条件的菜谱。请检查库存和偏好。</div>')+
      (rest.length ? `<section class="nutri-section">${sectionTitle('其他符合条件的菜谱',`共 ${rest.length} 道`)}<p class="nutri-note">按主要食材类别分组，每道菜只展示一次。</p>${restHTML}</section>` : '')+
      `<div class="actions" style="margin-top:23px">${btn('调整冰箱食材',"nav('pantry')",'secondary')}${btn('修改偏好',"nav('settings')",'ghost')}</div>`;
  };
})();
