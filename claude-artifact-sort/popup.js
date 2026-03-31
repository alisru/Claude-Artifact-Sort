const status = document.getElementById('status');

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById('btn-open').addEventListener('click', async () => {
  const tab = await getTab();
  if (!tab?.url?.includes('claude.ai')) {
    status.textContent = 'Navigate to claude.ai first';
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { action: 'open_panel' });
  status.textContent = 'Panel opened ↗';
  window.close();
});

document.getElementById('btn-scan').addEventListener('click', async () => {
  const tab = await getTab();
  if (!tab?.url?.includes('claude.ai')) {
    status.textContent = 'Navigate to claude.ai first';
    return;
  }
  status.textContent = 'Scanning…';
  const resp = await chrome.tabs.sendMessage(tab.id, { action: 'scan' });
  status.textContent = `Found ${resp?.count ?? 0} nodes — see console`;
});
