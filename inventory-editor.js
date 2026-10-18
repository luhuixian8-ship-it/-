
/* 好好吃饭：库存确认页批量管理补丁。
   需在 index.html 的其他功能补丁之后加载。 */
(function () {
  'use strict';

  const checked = new Set();
  const MAX_QTY = 999;

  const getEntries = () =>
    Object.keys(state.inventory).filter(
      n => Number(state.inventory[n]) > 0
    );

  const htmlSafe = v => esc(String(v));

  const normalize = (name, raw) => {
    const count = names[name]?.u === 'count';
    if (String(raw).trim() === '') return null;

    const value = Number(raw);
    if (!Number.isFinite(value) ||
        value < 0 || value > MAX_QTY) return null;

    if (count && !Number.isInteger(value)) return null;
    if (!count && Math.round(value * 2) !== value * 2)
      return null;

    return value;
  };

  const unitsHint = name =>
    names[name]?.u === 'count'
      ? '请输入整数（0–999）'
      : '支持 0.5 的倍数（0–999）';

  const tick = name =>
    names[name]?.u === 'count' ? 1 : 0.5;

  const cleanChecked = () => {
    const present = new Set(getEntries());
    for (const name of checked) {
      if (!present.has(name)) checked.delete(name);
    }
  };

  // 替换确认食材清单页面
  confirmPage = function () {
    const arr = getEntries();
    cleanChecked();

    const allSelected =
      arr.length > 0 && arr.every(n => checked.has(n));

    const rows = arr.map(n => {
      const safeName = htmlSafe(n);
      const key = encodeURIComponent(n);
      const label = names[n]?.u === 'count'
        ? '按个数记录'
        : '一人份可做几顿';

      return `
        <div class="list-row inv-row">
          <label class="inv-select" aria-label="选择${safeName}">
            <input type="checkbox"
              onchange="inventoryToggleSelected(
                decodeURIComponent('${key}'), this.checked)"
              ${checked.has(n) ? 'checked' : ''}>
          </label>

          <div class="small-emoji">${emoji(n)}</div>

          <div class="grow">
            <b>${safeName}</b>
            <small>${label}</small>
          </div>

          <div class="qty inv-qty">
            <button
              aria-label="减少${safeName}"
              onclick="inventoryStep(
                decodeURIComponent('${key}'), -1)">−</button>

            <input type="number"
              inputmode="decimal"
              aria-label="${safeName}数量"
              title="${unitsHint(n)}"
              min="0"
              max="${MAX_QTY}"
              step="${tick(n)}"
              value="${state.inventory[n]}"
              onchange="inventorySetQty(
                decodeURIComponent('${key}'),this)"
              onkeydown="if(event.key==='Enter'){this.blur()}">

            <button
              aria-label="增加${safeName}"
              onclick="inventoryStep(
                decodeURIComponent('${key}'), 1)">+</button>
          </div>
        </div>`;
    }).join('');

    return header(
      '确认食材清单',
      '可直接输入数量、勾选多项删除，或一次清空食材库存。'
    ) + `
      <div class="card narrow">

        ${arr.length ? `
          <div class="inv-toolbar">
            <label class="inv-select-all">
              <input type="checkbox"
                id="inv-select-all"
                ${allSelected ? 'checked' : ''}
                onchange="inventorySelectAll(this.checked)">
              全选
              <span class="inv-count">
                (${checked.size}/${arr.length})
              </span>
            </label>

            <div class="inv-tools">
              <button class="btn secondary small"
                onclick="inventoryDeleteSelected()"
                ${checked.size ? '' : 'disabled'}>
                删除选中 (${checked.size})
              </button>

              <button class="btn secondary small inv-danger"
                onclick="inventoryClearAll()">
                清空全部食材
              </button>
            </div>
          </div>
          ${rows}
        ` : `
          <div class="empty">
            还没有添加食材，可以点击下方按钮添加。
          </div>
        `}

        <div class="break"></div>

        <div class="actions">
          ${btn('继续添加/拍照',
                 "nav('scan')", 'secondary')}
          ${btn('生成今晚的推荐 →',
                 "nav('results')")}
        </div>
      </div>

      ${sectionTitle('常备调料','点击可修改是否拥有')}

      <div class="option-grid">
        ${D.ingredients
          .filter(x => x.u === 'boolean')
          .map(x => `
            <button class="chip ${state.season[x.n] ? 'on' : ''}"
              onclick="toggleIngredient('${x.n}')">
              ${state.season[x.n] ? '✓ ' : ''}
              ${htmlSafe(x.n)}
            </button>
          `).join('')}
      </div>

      <p class="sub" style="margin-top:12px">
        数量为库存估算值，不代表精确重量；
        清空食材不会清除常备调料、用户偏好或登录状态。
      </p>`;
  };

  // 勾选单个食材
  window.inventoryToggleSelected = function (name, on) {
    if (on) checked.add(name);
    else checked.delete(name);
    render();
  };

  // 全选与取消全选
  window.inventorySelectAll = function (on) {
    checked.clear();
    if (on) getEntries().forEach(n => checked.add(n));
    render();
  };

  // 删除选中的食材
  window.inventoryDeleteSelected = function () {
    cleanChecked();
    const list = [...checked];
    if (!list.length) return;

    if (!window.confirm(
      `确认删除选中的 ${list.length} 种食材吗？`
    )) return;

    list.forEach(n => delete state.inventory[n]);

    checked.clear();
    persist();
    render();
    toast(`已删除 ${list.length} 种食材`);
  };

  // 清空全部食材
  window.inventoryClearAll = function () {
    const list = getEntries();
    if (!list.length) return;

    if (!window.confirm(
      `将清空全部 ${list.length} 种食材，确定继续吗？\n` +
      `常备调料和个人设置会保留。`
    )) return;

    list.forEach(n => delete state.inventory[n]);

    checked.clear();
    persist();
    render();
    toast('食材库存已清空');
  };

  // 直接手动输入数量
  window.inventorySetQty = function (name, input) {
    const value = normalize(name, input.value);

    if (value === null) {
      window.alert(
        `${name}：${unitsHint(name)}。输入 0 可删除该食材。`
      );
      input.value = state.inventory[name] ?? 0;
      input.focus();
      return;
    }

    if (value === 0) {
      delete state.inventory[name];
      checked.delete(name);
    } else {
      state.inventory[name] = value;
    }

    persist();
    render();
  };

  // 加减按钮
  window.inventoryStep = function (name, direction) {
    const value = Math.max(
      0,
      Math.min(
        MAX_QTY,
        Math.round(
          ((Number(state.inventory[name]) || 0) +
           direction * tick(name)) * 2
        ) / 2
      )
    );

    if (value === 0) {
      delete state.inventory[name];
      checked.delete(name);
    } else {
      state.inventory[name] = value;
    }

    persist();
    render();
  };

  // 样式
  const style = document.createElement('style');

  style.textContent = `
    .inv-toolbar {
      display:flex;
      align-items:center;
      justify-content:space-between;
      flex-wrap:wrap;
      gap:14px;
      padding:4px 0 20px;
      border-bottom:1px solid var(--line);
    }

    .inv-tools {
      display:flex;
      align-items:center;
      gap:8px;
      flex-wrap:wrap;
    }

    .inv-danger {
      color:#ac4039!important;
      border-color:#efd4d1!important;
    }

    .inv-select-all,
    .inv-select {
      display:inline-flex;
      align-items:center;
      gap:8px;
      cursor:pointer;
    }

    .inv-select input,
    .inv-select-all input {
      accent-color:var(--sage);
      width:19px;
      height:19px;
      cursor:pointer;
    }

    .inv-count {
      font-size:12px;
      color:var(--muted);
    }

    .inv-row {
      gap:11px;
    }

    .inv-qty {
      display:flex;
      align-items:center;
      gap:9px;
    }

    .inv-qty input {
      width:72px;
      min-width:0;
      height:42px;
      text-align:center;
      border:1px solid var(--line);
      border-radius:12px;
      background:white;
      color:var(--ink);
      font-size:18px;
      font-weight:650;
      appearance:textfield;
      -moz-appearance:textfield;
    }

    .inv-qty input::-webkit-inner-spin-button,
    .inv-qty input::-webkit-outer-spin-button {
      -webkit-appearance:none;
      margin:0;
    }

    .inv-qty input:focus {
      outline:2px solid var(--sage);
      outline-offset:1px;
    }

    @media(max-width:540px) {
      .inv-row {
        flex-wrap:wrap;
      }

      .inv-row .grow {
        min-width:calc(100% - 125px);
      }

      .inv-qty {
        margin-left:30px;
      }

      .inv-qty input {
        width:64px;
      }

      .inv-tools {
        width:100%;
      }

      .inv-tools button {
        flex:1;
      }
    }
  `;

  document.head.append(style);

  if (state.page === 'confirm') render();

})();
