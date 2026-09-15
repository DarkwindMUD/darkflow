import { performance } from 'node:perf_hooks';

import { createTerminalOutputModel } from '../public/js/terminal-output-model.mjs';

const caps = [1_000, 5_000, 10_000, 20_000];
const runs = 5;
const payloads = Array.from({ length: 2_000 }, (_, index) => `benchmark-${String(index).padStart(4, '0')}\n`);

function appendRecords(model, count) {
  for (let index = 0; index < count; index += 1) model.appendOutput(payloads[index % payloads.length]);
}

function percentile(samples, percentile) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentile) - 1];
}

function benchmark(cap) {
  const samples = [];
  const retained = [];
  for (let run = 0; run < runs; run += 1) {
    const model = createTerminalOutputModel({ recordLimit: cap });
    appendRecords(model, cap);
    const started = performance.now();
    appendRecords(model, payloads.length);
    samples.push(performance.now() - started);
    retained.push(model.snapshot().length);
  }
  return {
    cap,
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    retained: retained.join(','),
  };
}

const warmup = createTerminalOutputModel({ recordLimit: caps[0] });
appendRecords(warmup, caps[0] + payloads.length);

const results = caps.map(benchmark);
console.log(`terminal-output-model benchmark: ${runs} runs, ${payloads.length} completed lines per run`);
console.log('cap\tmedian ms\tp95 ms\tretained');
for (const result of results) {
  console.log(`${result.cap}\t${result.medianMs.toFixed(2)}\t${result.p95Ms.toFixed(2)}\t${result.retained}`);
}
