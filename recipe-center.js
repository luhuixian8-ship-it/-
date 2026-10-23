/* 食谱中心：浏览状态与营养推荐独立，不改变 candidate / recommend。 */
(function () {
  const originalResults = results;
  const filter = {
    mode: 'top',
    category: '全部',
    source: '全部',
    recipe: null
  };
  const categories = ['全部', '主食', '蔬菜', '蛋白质', '其他'];

  const sourceOf = r =>
    typeof r.source === 'string' && r.source.trim()
      ? r.source.trim()
      : '内置示例';

  function categoriesOf(r) {
    const found = new Set();

    for (const n of r.main) {
      if (
        names[n]?.c === '主食' ||
        ['土豆', '红薯', '山药', '芋头', '玉米'].includes(n)
      ) {
        found.add('主食');
      } else if (names[n]?.c === '蔬菜') {
        found.add('蔬菜');
      }

      if (['蛋奶豆', '肉禽海鲜'].includes(names[n]?.c)) {
        found.add('蛋白质');
      }
    }

    return found.size ? [...found] : ['其他'];
  }

  // 按原谱统计缺少的食材，含配料、调料。
  const missingOf = r =>
    [...new Set([...r.main, ...r.side, ...r.sp])]
      .filter(n => !has(n));

  function allowed(r) {
    return (
      r.t <= 30 &&
      (r.tool === '无' || state.prefs.tool.includes(r.tool)) &&
      (state.prefs.cu === '都做' || state.prefs.cu === r.cu) &&
      (!state.prefs.vegetarian || r.veg) &&
      r.heat <= state.prefs.heat &&
      [...r.main, ...r.side, ...r.sp].every(n =>
        safe(n) &&
        !forbidden(n) &&
        !(
          state.prefs.vegetarian &&
          ['蚝油', '鱼露', '料酒'].includes(n)
        )
      )
    );
  }

  window.recipeCenterFilter = function (key, value) {
    if (!['mode', 'category', 'source', 'recipe'].includes(key)) return;

    filter[key] = value;
    if (key !== 'recipe') filter.recipe = null;
    render();
  };

  const options = (values, selected) =>
    values.map((v, i) => `
      <option value="${i}" ${v === selected ? 'selected' : ''}>
        ${esc(v)}
      </option>
    `).join('');

  window.recipeCenterSource = i =>
    window.recipeCenterFilter(
      'source',
      ['全部', ...new Set(D.recipes.map(sourceOf))][Number(i)] || '全部'
    );

  results = function () {
    const tabs = `
      <div class="toolbar" role="group" aria-label="食谱专区">
        ${[
          ['top', '今日优选 Top 3'],
          ['all', '全部食谱'],
          ['near', '差 1–2 种食材']
        ].map(([key, label]) => `
          <button
            class="chip ${filter.mode === key ? 'on' : ''}"
            aria-pressed="${filter.mode === key}"
            onclick="recipeCenterFilter('mode','${key}')"
          >${label}</button>
        `).join('')}
      </div>
    `;

    // 原有营养覆盖推荐完整保留。
    if (filter.mode === 'top') return tabs + originalResults();

    const sources = ['全部', ...new Set(D.recipes.map(sourceOf))];

    const controls = `
      <div class="toolbar">
        <label>
          分类
          <select
            class="search"
            onchange="recipeCenterFilter('category',${JSON.stringify(categories).replaceAll('"', '&quot;')}[Number(this.value)])"
          >
            ${options(categories, filter.category)}
          </select>
        </label>
        <label>
          来源
          <select
            class="search"
            onchange="recipeCenterSource(this.value)"
          >
            ${options(sources, filter.source)}
          </select>
        </label>
      </div>
    `;

    let list = D.recipes.filter(r =>
      (filter.category === '全部' ||
        categoriesOf(r).includes(filter.category)) &&
      (filter.source === '全部' ||
        sourceOf(r) === filter.source)
    );

    if (filter.mode === 'near') {
      list = list
        .filter(r =>
          allowed(r) &&
          missingOf(r).length >= 1 &&
          missingOf(r).length <= 2
        )
        .sort((a, b) =>
          missingOf(a).length - missingOf(b).length || a.t - b.t
        );
    }

    const selected = list.find(r => r.id === filter.recipe);

    const heading = header(
      '智能食谱中心',
      filter.mode === 'all'
        ? '浏览全部原始食谱；是否可做仍按库存和厨房偏好判断。'
        : '按原谱统计缺少的食材，含配料与调料；已排除不符合过敏、忌口、厨具、时间和辣度偏好的食谱。'
    );

    if (selected) {
      return tabs + heading + controls + `
        <div class="card narrow">
          <h2>${esc(selected.n)}</h2>
          <p class="sub">
            来源：${esc(sourceOf(selected))}
            · 原谱 · ${selected.t} 分钟
          </p>

          <h3>原始食材</h3>
          <p>${
            [...new Set([
              ...selected.main,
              ...selected.side,
              ...selected.sp
            ])].map(esc).join('、')
          }</p>

          <h3>需要补充</h3>
          <p>${
            missingOf(selected).map(esc).join('、') || '原始食材齐全'
          }</p>

          <h3>原始步骤</h3>
          <ol>
            ${selected.steps.map(s => `<li>${esc(s)}</li>`).join('')}
          </ol>

          <div class="actions">
            ${btn(
              '返回列表',
              "recipeCenterFilter('recipe',null)",
              'secondary'
            )}
            ${
              candidate(selected)
                ? btn('查看可做方案', `openRecipe(${selected.id})`)
                : '<span class="sub">当前不满足可做条件，请先补齐食材并检查偏好。</span>'
            }
          </div>
        </div>
      `;
    }

    return tabs + heading + controls +
      sectionTitle(
        filter.mode === 'all' ? '全部食谱' : '补购后再做',
        `${list.length} 道`
      ) +
      (
        list.length
          ? `
            <div class="recipes">
              ${list.map(r => {
                const missing = missingOf(r);
                const ready = candidate(r) && (
                  r.heat <= state.prefs.heat ||
                  r.sp.includes('辣椒') && !r.main.includes('辣椒')
                );

                return `
                  <div class="card recipe">
                    <div class="art" aria-hidden="true">
                      ${recipeIcon(r)}
                    </div>
                    <div class="recipe-body">
                      <span class="tag">
                        ${esc(categoriesOf(r).join(' · '))}
                      </span>
                      <h3>${esc(r.n)}</h3>
                      <div class="meta">
                        <span>${r.t} 分钟</span>
                        <span>${esc(r.tool)}</span>
                        <span>来源：${esc(sourceOf(r))}</span>
                      </div>
                      <p>${
                        missing.length
                          ? '原谱缺少 ' + missing.length +
                            ' 种：' + missing.map(esc).join('、')
                          : '原始食材齐全'
                      }。</p>
                      <p>${
                        ready
                          ? '✓ 当前有可做方案'
                          : '需补齐食材或调整厨房偏好'
                      }</p>
                      ${btn(
                        '查看原谱',
                        `recipeCenterFilter('recipe',${r.id})`,
                        'secondary'
                      )}
                      ${
                        ready
                          ? btn('查看可做方案', `openRecipe(${r.id})`)
                          : ''
                      }
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `
          : `
            <div class="empty">
              当前筛选没有食谱，请切换分类、来源或调整库存和偏好。
            </div>
          `
      );
  };
})();
