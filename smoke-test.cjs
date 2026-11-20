const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class Element {
  constructor() {
    this.innerHTML = '';
    this.textContent = '';
    this.children = [];
    this.style = {};
    this.value = '';
    this.disabled = false;
    this.classList = {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      toggle(value, force) {
        const shouldAdd = force === undefined ? !this.values.has(value) : force;
        shouldAdd ? this.values.add(value) : this.values.delete(value);
        return shouldAdd;
      },
      contains(value) { return this.values.has(value); },
    };
  }
  appendChild(child) { this.children.push(child); }
  click() { this.onclick?.(); }
}

const elements = new Map();
const screens = ['welcome', 'setup', 'boardScreen', 'questionScreen', 'winnerScreen'].map(() => new Element());
const intervals = new Map();
const storage = new Map();
let nextInterval = 1;
const teamInput = { value: 'Команда студентов' };
const context = {
  console,
  localStorage: {
    setItem(key, value) { storage.set(key, String(value)); },
    getItem(key) { return storage.get(key) ?? null; },
  },
  document: {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    createElement() { return new Element(); },
    querySelectorAll(selector) { return selector === '.screen' ? screens : []; },
    querySelector(selector) { return selector === '.team-input' ? teamInput : null; },
  },
  window: { scrollTo() {} },
  confirm: () => true,
  setTimeout: fn => { fn(); return 1; },
  setInterval: fn => { const id = nextInterval++; intervals.set(id, fn); return id; },
  clearInterval: id => intervals.delete(id),
};
const source = fs.readFileSync('index.html', 'utf8');
const js = source.slice(source.indexOf('<script>') + 8, source.indexOf('</script>'));
new vm.Script(`${js}\nglobalThis.game = { get state(){return state}, set state(value){state=value}, categories, blankState, openQuestion, stopTimer, finishQuestion, restore, hashHostCode };`).runInNewContext(context);

assert.equal(context.game.categories.length, 5);
assert.equal(context.game.categories.reduce((n, c) => n + c.questions.length, 0), 25);
assert.equal((source.match(/id="teamFields"/g) || []).length, 1);
assert.ok(!source.includes('addTeamBtn'));

elements.get('startBtn').click();
assert.equal(elements.get('teamFields').children.length, 1);
assert.equal(elements.get('hostCodeSetup').value, '');
elements.get('hostCodeSetup').value = 'abcd';
elements.get('launchBtn').click();
assert.equal(context.game.state, null, 'Game must require a host code of at least five characters');
elements.get('hostCodeSetup').value = 'Code5';
elements.get('launchBtn').click();
assert.equal(context.game.state.teams.length, 1);
assert.equal(context.game.state.teams[0].name, 'Команда студентов');

const tile = { disabled: false, dataset: { ci: '0', qi: '0' } };
elements.get('board').onclick({ target: { closest: () => tile } });
assert.equal(JSON.stringify(context.game.state.question), '[0,0]');
assert.equal(elements.get('hostAuthModal')?.classList.contains('show') ?? false, false, 'Code entered at game start should unlock the whole party');
assert.equal(context.game.state.timer, 20);
assert.equal(context.game.state.timerRunning, true);
assert.equal(elements.get('answerText').textContent, '', 'Answer must stay absent from the visible DOM before host reveal');

[...intervals.values()][0]();
assert.equal(context.game.state.timer, 19);
elements.get('timerToggle').click();
assert.equal(context.game.state.timerRunning, false);
assert.equal(elements.get('hostAuthModal')?.classList.contains('show') ?? false, false, 'Timer must not ask for the code after start');
elements.get('timerToggle').click();
assert.equal(context.game.state.timerRunning, true);
elements.get('revealBtn').click();
assert.equal(context.game.state.revealed, true);
assert.equal(elements.get('answerText').textContent, 'Биотехнология');
elements.get('correctBtn').click();
assert.equal(context.game.state.teams[0].score, 100);
assert.equal(context.game.state.used.includes('0-0'), true);

elements.get('lockHostBtn').click();
assert.ok(elements.get('lockHostBtn').textContent.includes('Войти ведущим'));
const secondTile = { disabled: false, dataset: { ci: '0', qi: '1' } };
elements.get('board').onclick({ target: { closest: () => secondTile } });
assert.ok(elements.get('hostAuthModal').classList.contains('show'), 'Locked game must request the host code');
elements.get('hostAuthInput').value = 'wrong-code';
elements.get('hostAuthConfirm').click();
assert.equal(JSON.stringify(context.game.state.question), '[0,0]', 'Wrong code must not change the question');
elements.get('hostAuthInput').value = 'Code5';
elements.get('hostAuthConfirm').click();
assert.equal(JSON.stringify(context.game.state.question), '[0,1]');
assert.equal(elements.get('hostAuthModal').classList.contains('show'), false);
elements.get('revealBtn').click();
elements.get('incorrectBtn').click();
assert.equal(context.game.state.teams[0].score, 100);
assert.equal(context.game.state.used.includes('0-1'), true);

context.localStorage.setItem('biotech-jeopardy-v1', JSON.stringify({
  teams: [{ name: 'Первая команда', score: 400 }, { name: 'Вторая команда', score: 300 }],
  turn: 1, used: ['0-0'], screen: 'board', question: null, timer: 20, timerRunning: false,
}));
assert.equal(context.game.restore(), true);
assert.equal(context.game.state.teams.length, 1);
assert.equal(context.game.state.teams[0].name, 'Первая команда');
assert.equal(context.game.state.teams[0].score, 400);
assert.equal(context.game.state.turn, 0);
console.log('OK: одна команда, однократный вход ведущего, блокировка, скрытие ответа, таймер, начисление очков и миграция сохранения.');
