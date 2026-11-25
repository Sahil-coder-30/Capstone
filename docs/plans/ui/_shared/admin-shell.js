// Fills every <aside class="side" data-active="users" data-role="maintainer|support">
// with the admin portal navigation, so each frame only draws its own page.
// The menu mirrors the module list in Admin/PLAN.md section 4.2. Menus are
// hidden by grant in the portal; the backend still checks every request.
(function () {
  const NAV = [
    { id: 'overview', label: 'Overview', icon: 'dashboard', mod: 'analytics' },
    { id: 'analytics', label: 'Analytics', icon: 'chart', mod: 'analytics' },
    { group: 'People' },
    { id: 'users', label: 'Users', icon: 'users', mod: 'users' },
    { id: 'projects', label: 'Projects', icon: 'layers', mod: 'projects' },
    { id: 'chats', label: 'Chats', icon: 'message', mod: 'chats' },
    { id: 'ai', label: 'AI runs', icon: 'bot', mod: 'ai' },
    { id: 'payments', label: 'Payments', icon: 'card', mod: 'payments' },
    { group: 'Operations' },
    { id: 'cluster', label: 'Cluster', icon: 'server', mod: 'cluster' },
    { id: 'logs', label: 'Logs', icon: 'logs', mod: 'logs' },
    { id: 'trace', label: 'Trace', icon: 'activity', mod: 'tickets' },
    { id: 'explorer', label: 'Data explorer', icon: 'database', mod: 'db' },
    { id: 'tickets', label: 'Tickets', icon: 'ticket', mod: 'tickets', n: 3 },
    { group: 'Notify', k6: true },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone', mod: 'notify', k6: true },
    { id: 'deliveries', label: 'Deliveries', icon: 'inbox', mod: 'notify', k6: true },
    { group: 'Organization', maint: true },
    { id: 'applications', label: 'Applications', icon: 'user-check', maint: true, n: 2 },
    { id: 'admins', label: 'Admins', icon: 'shield', maint: true },
    { id: 'templates', label: 'Role templates', icon: 'sliders', maint: true },
    { id: 'audit', label: 'Audit log', icon: 'history', mod: 'audit' },
  ];
  const SUPPORT = ['overview', 'users', 'projects', 'chats', 'trace', 'tickets', 'audit'];
  const ic = (n) => `<svg class="i"><use href="#i-${n}"/></svg>`;

  document.querySelectorAll('aside.side[data-active]').forEach((el) => {
    const active = el.dataset.active;
    const role = el.dataset.role || 'maintainer';
    const maint = role === 'maintainer';
    const k6 = el.dataset.k6 === 'true';
    let html = `<div class="side-brand"><div class="mark">T</div><div><b>Taksha Admin</b><span>${maint ? 'Maintainer' : 'Support Agent'}</span></div></div>`;
    let pendingGroup = null;
    NAV.forEach((item) => {
      if (item.k6 && !k6) return;
      if (item.group) { if (item.maint && !maint) return; pendingGroup = item.group; return; }
      if (item.maint && !maint) return;
      if (!maint && !SUPPORT.includes(item.id)) return;
      if (pendingGroup) { html += `<div class="side-group">${pendingGroup}</div>`; pendingGroup = null; }
      html += `<div class="side-link${item.id === active ? ' on' : ''}">${ic(item.icon)}${item.label}${item.n ? `<span class="n">${item.n}</span>` : ''}</div>`;
    });
    html += `<div class="side-foot"><div class="avatar">${maint ? 'M' : 'RK'}</div><div style="font-size:12px;min-width:0"><div style="color:var(--text-primary)">${maint ? 'Maintainer' : 'Riya K.'}</div><div class="muted">${maint ? 'Passkey · 3 min ago' : 'Access until 18 Feb'}</div></div></div>`;
    el.innerHTML = html;
  });
})();
