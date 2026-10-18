/* 好好吃饭 · /dashboard 会话检查（Demo 阶段）
   注意：此脚本是前端页面访问门禁，不构成服务端数据授权。
   真实用户数据仍必须使用 Supabase RLS 保护。
*/
(function () {
  if (location.pathname.replace(/\/$/, '') !== '/dashboard') return;

  document.documentElement.style.visibility = 'hidden';

  const SUPABASE_URL = 'https://smavnmrchaootkrcqvmq.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_TXXkDFOTWPpbImY_MSH9IA_DYZxKY5G';
  const sdkUrl = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  function fail(message) {
    document.documentElement.style.visibility = 'visible';
    document.body.innerHTML = '';
    const wrapper = document.createElement('main');
    wrapper.style.cssText = 'max-width:460px;margin:12vh auto;padding:24px;font:16px system-ui,sans-serif;line-height:1.7';
    const title = document.createElement('h2');
    title.textContent = '登录状态暂时无法验证';
    const detail = document.createElement('p');
    detail.textContent = message;
    const retry = document.createElement('button');
    retry.textContent = '重新检查';
    retry.onclick = () => location.reload();
    wrapper.append(title, detail, retry);
    document.body.append(wrapper);
  }

  const script = document.createElement('script');
  script.src = sdkUrl;
  script.onload = async function () {
    try {
      if (!window.supabase?.createClient) throw new Error('认证组件没有加载成功');
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) {
        // 不把离线或 Supabase 故障误判为“未登录”。
        if (error && !/session|token|jwt|auth session missing/i.test(error.message || '')) {
          throw error;
        }
        location.replace('/login');
        return;
      }
      document.documentElement.style.visibility = 'visible';
    } catch (err) {
      fail('请检查网络连接后重试。' + (err?.message ? '（' + err.message + '）' : ''));
    }
  };
  script.onerror = () => fail('无法加载 Supabase 登录组件，请检查网络连接。');
  document.head.append(script);
})();
