const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class Element {
  constructor() {
    this.innerHTML = '';
    this.textContent = '';
    this.style = {};
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
}

const elements = new Map();
const screens = ['welcome', 'setup', 'boardScreen', 'questionScreen', 'winnerScreen'].map(() => new Element());
const intervals = new Map();
let nextInterval = 1;
const context = {
  console,
  localStorage: { data: null, setItem(_key, value) { this.data = value; }, getItem() { return this.data; } },
  document: {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    querySelectorAll(selector) { return selector === '.screen' ? screens : []; },
  },
  window: { scrollTo() {} },
  confirm: () => true,
  setTimeout: fn => { fn(); return 1; },
  setInterval: fn => { const id = nextInterval++; intervals.set(id, fn); return id; },
  clearInterval: id => intervals.delete(id),
};
const source = fs.readFileSync('index.html', 'utf8');
const js = source.slice(source.indexOf('<script>') + 8, source.indexOf('</script>'));
new vm.Script(`${js}\nglobalThis.game = { get state(){return state}, set state(value){state=value}, categories, blankState, openQuestion, startTimer, stopTimer, finishQuestion };`).runInNewContext(context);

assert.equal(context.game.categories.length, 5);
assert.equal(context.game.categories.reduce((n, c) => n + c.questions.length, 0), 25);
context.game.state = context.game.blankState(['Команда Альфа', 'Команда Бета']);
context.game.openQuestion(0, 0);
assert.equal(context.game.state.timer, 20);
assert.equal(context.game.state.timerRunning, true);
const timerCallback = [...intervals.values()][0];
timerCallback();
assert.equal(context.game.state.timer, 19);
context.game.stopTimer();
assert.equal(context.game.state.timerRunning, false);
assert.equal(context.game.state.teams[0].score, 0);
assert.equal(context.game.state.revealed, false);

context.game.state.revealed = true;
context.game.finishQuestion(true);
assert.equal(context.game.state.teams[0].score, 100);
assert.equal(context.game.state.turn, 1);
assert.ok(context.game.state.used.includes('0-0'));
assert.deepEqual(JSON.parse(context.localStorage.data).used, ['0-0']);
context.game.openQuestion(0, 1);
context.game.state.revealed = true;
context.game.finishQuestion(false);
assert.equal(context.game.state.teams[1].score, 0);
assert.equal(context.game.state.turn, 0);
assert.ok(context.game.state.used.includes('0-1'));
console.log('OK: 5 категорий, 25 вопросов, 20-секундный таймер, пауза, верный/неверный ответ, очки, очередь и сохранение.');
