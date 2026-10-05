// 隐私页：下载 / 删除我的数据（同源请求，携带 Cookie 与本地令牌）
(function () {
  var msg = document.getElementById('mydata-msg');
  var token = null; try { token = localStorage.getItem('mingpan-token'); } catch (e) {}
  var headers = token ? { Authorization: 'Bearer ' + token } : {};
  var say = function (t) { msg.textContent = t; };
  document.getElementById('export-btn').onclick = function () {
    fetch('/api/v1/me/export', { headers: headers, credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) throw new Error('还没有你的数据记录');
      if (!r.ok) throw new Error('下载失败，请稍后再试');
      return r.blob();
    }).then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mingpan-my-data.json'; a.click();
      say('已开始下载');
    }).catch(function (e) { say(e.message); });
  };
  var armed = false, btn = document.getElementById('delete-btn');
  btn.onclick = function () {
    if (!armed) { armed = true; btn.textContent = '再点一次确认删除'; setTimeout(function () { armed = false; btn.textContent = '删除我的全部数据'; }, 4000); return; }
    fetch('/api/v1/me', { method: 'DELETE', headers: headers, credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) throw new Error('服务器上没有你的数据');
      if (!r.ok) throw new Error('删除失败，请稍后再试');
      try { ['mingpan-token', 'mingpan-chat-v2', 'mingpan-chat-v1', 'mingpan-migrated'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      say('已删除你在服务器和本机上的全部数据。');
      btn.disabled = true;
    }).catch(function (e) { say(e.message); });
  };
})();
