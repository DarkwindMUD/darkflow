const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { chromium } = require('playwright');

const root = `${__dirname}/../public`;
const runs = Number(process.env.DARKFLOW_BENCH_RUNS || 5);
const currentCore = execFileSync('git', ['show', 'HEAD:public/js/terminal-output-core.mjs'], {
  encoding: 'utf8',
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.route('http://darkflow-benchmark.test/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/js/current-terminal-output-core.mjs') {
      await route.fulfill({ body: currentCore, contentType: 'text/javascript' });
    } else if (pathname.startsWith('/js/')) {
      await route.fulfill({ body: fs.readFileSync(root + pathname), contentType: 'text/javascript' });
    } else await route.fulfill({ body: '<body></body>', contentType: 'text/html' });
  });
  await page.goto('http://darkflow-benchmark.test/');
  const result = await page.evaluate(async (runs) => {
    const percentile = (values, fraction) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
    };
    const candidate = await import('/js/terminal-output-core.mjs');
    const current = await import('/js/current-terminal-output-core.mjs');
    const legacy = await import('/js/output.js');
    const { createTerminalOutputModel } = await import('/js/terminal-output-model.mjs');
    const { dom, state } = await import('/js/state.js');
    const frame = () => new Promise(requestAnimationFrame);
    const lines = [
      'The goblin swings at you.\n',
      '\x1b[31mThe goblin\x1b[0m swings. You \x1b[32mhit\x1b[0m for 25 damage.\n',
      `${'wrapped combat output '.repeat(12)}\n`,
    ];
    const block = (count, offset = 0) =>
      Array.from({ length: count }, (_, index) => lines[(index + offset) % lines.length]).join('');
    const html = (kind) => {
      document.body.innerHTML = `<style>
        .shell{display:flex;flex-direction:column;height:520px;width:800px;overflow:hidden}
        .output{flex:1;min-height:0;overflow:auto;padding:8px 12px;font:14px/1.4 monospace;white-space:pre-wrap;overflow-wrap:break-word}
        .split{display:none;flex-direction:column;min-height:0}.history{flex:1}.live{flex:1}
        .legacy.split-active>.main,.current.split-active>.main{display:none}
        .legacy.split-active>.split,.current.split-active>.split{display:flex;flex:1}
        .candidate.split-active>.split{display:flex;flex:0 0 calc(60% - 5px)}
        .divider{flex:0 0 10px}</style>
        <section class="shell ${kind}" id="output-shell"><button id="pause"></button><button id="live"></button><button id="clear"></button>
        <div class="split" id="split"><div class="output history" id="history"></div><div class="divider" id="divider"></div><div class="output live" id="live-output"></div></div>
        <div class="output main" id="main"></div><div id="announcer"></div></section>`;
      return {
        shell: document.querySelector('.shell'), main: document.getElementById('main'),
        history: document.getElementById('history'), live: document.getElementById('live-output'),
      };
    };
    const counts = (hosts) => ({
      all: document.querySelectorAll('.output-line').length,
      main: hosts.main.querySelectorAll('.output-line').length,
      history: hosts.history.querySelectorAll('.output-line').length,
      live: hosts.live.querySelectorAll('.output-line').length,
    });
    const timed = async (append, offset) => {
      const samples = [];
      for (let index = 0; index < 10; index += 1) {
        await frame();
        const start = performance.now();
        append(block(20, offset + index));
        await frame();
        document.body.offsetHeight;
        samples.push(performance.now() - start);
      }
      return samples;
    };
    const fill = async (append, size) => {
      for (let index = 0; index < size; index += 500) {
        append(block(Math.min(500, size - index), index));
        await frame();
      }
      await frame();
      await frame();
    };
    const runCore = async (name, factory, size) => {
      const hosts = html(name);
      const model = createTerminalOutputModel({ recordLimit: size });
      const core = factory.createTerminalOutputCore({
        shell: hosts.shell, output: hosts.main, historyOutput: hosts.history,
        liveOutput: hosts.live, divider: document.getElementById('divider'),
        pauseButton: document.getElementById('pause'), liveButton: document.getElementById('live'),
        clearButton: document.getElementById('clear'), announcer: document.getElementById('announcer'),
        subscribeOutput: model.subscribe, clearOutput: model.clear,
      });
      core.configure({ scrollbackBehavior: 'split', scrollbackSplitRatio: 0.6 });
      await fill(model.appendOutput, size);
      const normal = await timed(model.appendOutput, size);
      const normalMounted = counts(hosts);
      hosts.main.dispatchEvent(new WheelEvent('wheel'));
      core.scrollByPage(-0.8);
      hosts.main.scrollTop = Math.max(0, hosts.main.scrollHeight - hosts.main.clientHeight * 2);
      hosts.main.dispatchEvent(new Event('scroll'));
      await frame(); await frame();
      const split = await timed(model.appendOutput, size + 1000);
      const splitMounted = counts(hosts);
      core.dispose(); model.dispose();
      return { normal, split, normalMounted, splitMounted };
    };
    const runLegacy = async (size) => {
      const hosts = html('legacy');
      Object.assign(dom, { outputShell: hosts.shell, output: hosts.main, outputSplit: document.getElementById('split'), outputHistory: hosts.history, outputLive: hosts.live, outputDivider: document.getElementById('divider'), outputPauseBtn: document.getElementById('pause'), outputLiveBtn: document.getElementById('live'), outputEscapeHint: null, screenReaderAnnouncer: document.getElementById('announcer') });
      state.settings.scrollbackBehavior = 'split'; state.settings.scrollbackSplitRatio = 0.6;
      const dispose = legacy.initOutput();
      legacy.setOutputScrollbackPreset(size === 5000 ? 'low' : size === 10000 ? 'normal' : 'high');
      await fill(legacy.appendOutput, size);
      const normal = await timed(legacy.appendOutput, size);
      const normalMounted = counts(hosts);
      hosts.main.dispatchEvent(new WheelEvent('wheel')); legacy.scrollActiveOutputByPage(-0.8);
      hosts.main.dispatchEvent(new Event('scroll')); await frame(); await frame();
      const split = await timed(legacy.appendOutput, size + 1000);
      const splitMounted = counts(hosts);
      dispose(); return { normal, split, normalMounted, splitMounted };
    };
    const raw = [];
    for (const size of [5000, 10000, 20000]) for (let run = 1; run <= runs; run += 1) {
      raw.push({ renderer: 'current', size, ...(await runCore('current', current, size)) });
      raw.push({ renderer: 'legacy', size, ...(await runLegacy(size)) });
      raw.push({ renderer: 'candidate', size, ...(await runCore('candidate', candidate, size)) });
    }
    return ['current', 'legacy', 'candidate'].flatMap((renderer) => [5000, 10000, 20000].flatMap((size) =>
      ['normal', 'split'].map((mode) => {
        const rows = raw.filter((row) => row.renderer === renderer && row.size === size);
        const samples = rows.flatMap((row) => row[mode]);
        return { renderer, size, mode, medianMs: +percentile(samples, .5).toFixed(1), p95Ms: +percentile(samples, .95).toFixed(1), mounted: rows[0][`${mode}Mounted`] };
      })));
  }, runs);
  console.table(result);
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
