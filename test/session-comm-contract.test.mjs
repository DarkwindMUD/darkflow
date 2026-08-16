import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadCommValidators(t) {
  const server = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    hmr: false,
    watch: null,
  });

  t.after(async () => {
    await server.close();
  });

  const ssr = server.environments.ssr;
  assert.ok(isRunnableDevEnvironment(ssr));
  return ssr.runner.import("/gmcp/contracts/validators.ts");
}

test("Comm.Channel.List accepts documented arrays and retained mapping values", async (t) => {
  const { validateCommChannelList } = await loadCommValidators(t);

  assert.equal(
    validateCommChannelList([{ name: "gossip", caption: "Gossip", command: "gossip" }]).success,
    true,
  );
  assert.equal(
    validateCommChannelList({ gossip: true, auction: false, arena: 0, newbie: 1 }).success,
    true,
  );

  for (const invalid of [
    { gossip: "enabled" },
    { gossip: 2 },
    { gossip: null },
    "gossip",
    1,
    null,
  ]) {
    assert.equal(validateCommChannelList(invalid).success, false);
  }
});

test("other Comm contracts retain their existing validation", async (t) => {
  const { validateCommChannelMessage, validateCommChannelPlayers, validateCommChannelState } =
    await loadCommValidators(t);

  assert.equal(
    validateCommChannelMessage({ channel: "gossip", talker: "Acer", text: "Hi" }).success,
    true,
  );
  assert.equal(validateCommChannelMessage({ text: 42 }).success, false);

  assert.equal(validateCommChannelPlayers([{ name: "Acer" }]).success, true);
  assert.equal(validateCommChannelPlayers([{ name: 42 }]).success, false);

  assert.equal(validateCommChannelState("gossip").success, true);
  assert.equal(validateCommChannelState({ channel: "gossip" }).success, true);
  assert.equal(validateCommChannelState({ channel: 42 }).success, false);
});
