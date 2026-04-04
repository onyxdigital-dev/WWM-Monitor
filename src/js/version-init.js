// Auto-fills all elements with data-version or id="about-version" from package.json
;(async () => {
  if (!window.electronAPI || typeof window.electronAPI.getAppVersion !== 'function') return
  try {
    const version = await window.electronAPI.getAppVersion()
    // Fill by ID
    const el = document.getElementById('about-version')
    if (el) el.textContent = version
    // Fill any other elements tagged with data-version
    document.querySelectorAll('[data-version]').forEach(e => { e.textContent = version })
  } catch(e) {}
})()
