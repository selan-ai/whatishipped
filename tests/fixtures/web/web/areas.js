window.Areas = [];
window.Screens.push({
  id: 'home', order: 1, feature: 'Home', name: 'Home', source: 'src/Home.tsx:1', desc: 'The landing page.', opens: [],
  states: [{ name: 'Loaded', note: '', app: null, render: () => Frame.web({ body: window.C.Button({ label: 'Save' }), style: '' }) }],
});
