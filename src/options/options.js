import { getSettings, saveSettings, resetSettings, DEFAULT_SETTINGS } from '../shared/settings.js';

const controls = Array.from(document.querySelectorAll('[data-setting]'));
const savedToast = document.getElementById('savedToast');

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function setControl(input, value) {
  if (input.type === 'checkbox') input.checked = !!value;
  else input.value = value;
  if (input.hasAttribute('data-range')) updateRangeLabel(input);
}

function updateRangeLabel(input) {
  const label = document.querySelector(`.rangeval[data-for="${input.dataset.setting}"]`);
  if (label) label.textContent = input.value;
}

function readControl(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number' || input.hasAttribute('data-range')) return Number(input.value);
  return input.value;
}

function gather() {
  const patch = {};
  for (const input of controls) patch[input.dataset.setting] = readControl(input);
  return patch;
}

async function load() {
  const settings = await getSettings();
  applyTheme(settings.theme);
  for (const input of controls) {
    const key = input.dataset.setting;
    if (key in settings) setControl(input, settings[key]);
  }
}

function flashSaved(text = '✓ Saved') {
  savedToast.textContent = text;
  savedToast.classList.add('show');
  setTimeout(() => savedToast.classList.remove('show'), 1600);
}

// Live updates: persist on every change for instant feedback.
for (const input of controls) {
  const handler = async () => {
    if (input.hasAttribute('data-range')) updateRangeLabel(input);
    const patch = { [input.dataset.setting]: readControl(input) };
    await saveSettings(patch);
    if (input.dataset.setting === 'theme') applyTheme(patch.theme);
  };
  input.addEventListener('change', handler);
  if (input.hasAttribute('data-range')) input.addEventListener('input', () => updateRangeLabel(input));
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  await saveSettings(gather());
  flashSaved();
});

document.getElementById('resetBtn').addEventListener('click', async () => {
  if (!confirm('Reset all settings to their defaults?')) return;
  await resetSettings();
  await load();
  applyTheme(DEFAULT_SETTINGS.theme);
  flashSaved('✓ Reset to defaults');
});

// Show welcome banner on first install.
if (new URLSearchParams(location.search).get('welcome')) {
  document.getElementById('welcome').classList.remove('hidden');
}

load();
