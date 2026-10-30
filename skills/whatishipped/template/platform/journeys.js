/*
 * Journeys: what a person does, step by step, through the screens and states on this board. Each step names a
 * screen's id and one of its states exactly, and the action that leads to the next step. The arrow between two
 * steps comes from the first screen's opens; a move the code's map lacks is marked on the page. Use the same id for
 * the same journey on every platform, so the brandbook links them.
 */
const step = (screen, state, action) => ({ screen, state, action });
window.Journeys.push(
  // {
  //   id: 'play-from-home', name: 'Play an episode from Home', feature: 'Home', who: 'A signed-in listener',
  //   goal: 'Finds an episode on Home and starts it.',
  //   steps: [step('home', 'Loaded (scenario)', 'Taps an episode'), step('episode', 'Loaded', 'Taps Play'), step('player', 'Playing', '')],
  // },
);
