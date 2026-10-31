window.C = {
  Button: ({ label }) => `<button class="t-button">${Frame.esc(label)}</button>`,
};
window.Catalog.push({
  group: 'Controls',
  items: [{ name: 'Button', source: 'src/Button.tsx:3', desc: 'A button.', demos: [Frame.d('Default', () => window.C.Button({ label: 'Save' }))] }],
});
