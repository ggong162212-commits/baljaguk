/* 인라인 SVG 아이콘 (Lucide 스타일, 이모지 대신 사용) */
(function () {
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/>',
    paw: '<ellipse cx="7" cy="8" rx="2" ry="2.6"/><ellipse cx="12" cy="6.2" rx="2" ry="2.7"/><ellipse cx="17" cy="8" rx="2" ry="2.6"/><path d="M12 12.2c-2.6 0-4.8 2-4.8 4.3 0 1.7 1.3 2.7 3 2.7.9 0 1.3-.4 1.8-.4s.9.4 1.8.4c1.7 0 3-1 3-2.7 0-2.3-2.2-4.3-4.8-4.3Z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6.3"/><path d="M17.5 14.9c1.9.5 3.2 2.2 3.2 4.6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
    wallet: '<path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h12.5a2 2 0 0 1 2 2v9.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M3.5 8.5V7A2 2 0 0 1 5.5 5h11"/><circle cx="16.5" cy="13" r="1.3"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16" rx="3"/><rect x="9" y="2.5" width="6" height="4" rx="1.6"/><path d="M9 12h6M9 16h4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    down: '<path d="m5 9 7 7 7-7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7"/>',
    edit: '<path d="M4 20h4L19 9a2.4 2.4 0 0 0-3.4-3.4L4.5 16.7Z"/><path d="m14.5 6.5 3 3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M20 14.4A8.5 8.5 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4Z"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="3"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    unlock: '<rect x="4.5" y="10" width="15" height="10.5" rx="3"/><path d="M8 10V7.5a4 4 0 0 1 7.6-1.7"/>',
    upload: '<path d="M12 16V4.5"/><path d="m7.5 9 4.5-4.5L16.5 9"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
    download: '<path d="M12 4.5V16"/><path d="m7.5 11.5 4.5 4.5 4.5-4.5"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 4.7-4.4a1.8 1.8 0 0 1 2.5 0L19.5 19"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3 1.8"/>',
    phone: '<path d="M7.7 3.8 9.4 8 7.6 9.8a11.6 11.6 0 0 0 6.6 6.6L16 14.6l4.2 1.7v3.2a1.5 1.5 0 0 1-1.7 1.5A17.5 17.5 0 0 1 3 5.5 1.5 1.5 0 0 1 4.5 3.8Z"/>',
    crown: '<path d="M4 17.5h16"/><path d="m3.5 7 4 3.5L12 4.5l4.5 6L20.5 7l-1.6 8H5.1Z"/>',
    star: '<path d="m12 4 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8Z"/>',
    alert: '<circle cx="12" cy="12" r="8.4"/><path d="M12 8v4.6M12 16h.01"/>',
    logout: '<path d="M14.5 8V5.5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V16"/><path d="M10 12h10.5"/><path d="m17.5 8.5 3.5 3.5-3.5 3.5"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.5 12a7.6 7.6 0 0 0-.1-1.2l1.8-1.4-1.8-3.1-2.1.8a7.4 7.4 0 0 0-2-1.2l-.3-2.3H9.9l-.3 2.3a7.4 7.4 0 0 0-2 1.2l-2.1-.8-1.8 3.1 1.8 1.4a7.4 7.4 0 0 0 0 2.4l-1.8 1.4 1.8 3.1 2.1-.8a7.4 7.4 0 0 0 2 1.2l.3 2.3h4.2l.3-2.3a7.4 7.4 0 0 0 2-1.2l2.1.8 1.8-3.1-1.8-1.4c.1-.4.1-.8.1-1.2Z"/>',
    heart: '<path d="M12 19.5s-7-4.3-7-9A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.5c0 4.7-7 9-7 9Z"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="m4.5 8 6.4 4.6a2 2 0 0 0 2.2 0L19.5 8"/>',
    pin: '<path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.4"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
    minus: '<path d="M5 12h14"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    school: '<path d="m12 4 9 4.5-9 4.5-9-4.5Z"/><path d="M6.5 11v4.5c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3V11"/>',
    sprout: '<path d="M12 20v-7"/><path d="M12 13c0-3.3-2.4-5.5-5.5-5.5 0 3 2.2 5.5 5.5 5.5Z"/><path d="M12 13c0-3.9 2.7-6.5 6-6.5 0 3.5-2.6 6.5-6 6.5Z"/>'
  };
  window.ic = function (name, cls) {
    const d = P[name] || P.paw;
    return '<svg class="svg' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  };
})();
