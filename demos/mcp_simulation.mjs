import { handleRequest } from '../src/mcp_v2.mjs';

// ══════════════════════════════════════════════
//  SIMULATION MCP: Claude et GPT parlent .ben
//  Exactement ce qui se passerait en production
// ══════════════════════════════════════════════

function call(method, params, id = 1) {
  const resp = handleRequest({ jsonrpc: "2.0", id, method, params });
  return JSON.parse(resp.result.content[0].text);
}

console.log('══════════════════════════════════════════════');
console.log('  MCP SIMULATION');
console.log('  Claude et GPT communiquent via .ben');
console.log('══════════════════════════════════════════════');
console.log();

// ── 1. Initialize ──
const init = handleRequest({
  jsonrpc: "2.0", id: 0, method: "initialize",
  params: { protocolVersion: "2024-11-05" }
});
console.log(`  Server: ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
console.log();

// ── 2. Claude learns arithmetic ──
console.log('── Claude apprend l\'arithmétique ──');
const learn1 = call("tools/call", {
  name: "benoit_learn",
  arguments: {
    agent_id: "claude",
    source: `add a,b -> a + b
add(2,3) 5
add(0,0) 0

multiply a,b -> a * b
multiply(3,4) 12
multiply(0,5) 0

negate x -> -x
negate(5) -5`
  }
});
console.log(`  Claude learned ${learn1.learned} functions: ${learn1.functions.join(', ')}`);
console.log(`  Verified: ${learn1.assertions.passed}/${learn1.assertions.total} assertions`);
console.log();

// ── 3. GPT learns string ops ──
console.log('── GPT apprend les strings ──');
const learn2 = call("tools/call", {
  name: "benoit_learn",
  arguments: {
    agent_id: "gpt",
    source: `greet name -> "Hello {name}"
greet("world") "Hello world"

upper text -> text.toUpperCase()
upper("hello") "HELLO"

len text -> text.length
len("abc") 3`
  }
});
console.log(`  GPT learned ${learn2.learned} functions: ${learn2.functions.join(', ')}`);
console.log(`  Verified: ${learn2.assertions.passed}/${learn2.assertions.total} assertions`);
console.log();

// ── 4. Claude teaches GPT (delta!) ──
console.log('── Claude enseigne à GPT (delta compression) ──');
const teach1 = call("tools/call", {
  name: "benoit_teach",
  arguments: {
    from_agent: "claude",
    to_agent: "gpt",
    source: `add a,b -> a + b
add(2,3) 5
add(0,0) 0

multiply a,b -> a * b
multiply(3,4) 12
multiply(0,5) 0

negate x -> -x
negate(5) -5`
  }
});
console.log(`  Original: ${teach1.delta.originalSize} chars`);
console.log(`  On wire:  ${teach1.delta.wireSize} chars (${teach1.delta.compression})`);
console.log(`  Skipped:  ${teach1.delta.skippedFunctions} fn, ${teach1.delta.skippedAssertions} assertions (GPT already knew nothing → all sent)`);
console.log(`  GPT now knows: ${teach1.receiverNowKnows} functions`);
console.log();

// ── 5. GPT teaches Claude back ──
console.log('── GPT enseigne à Claude (delta compression) ──');
const teach2 = call("tools/call", {
  name: "benoit_teach",
  arguments: {
    from_agent: "gpt",
    to_agent: "claude",
    source: `add a,b -> a + b
greet name -> "Hello {name}"
greet("world") "Hello world"
upper text -> text.toUpperCase()
upper("hello") "HELLO"
len text -> text.length
len("abc") 3`
  }
});
console.log(`  Original: ${teach2.delta.originalSize} chars`);
console.log(`  On wire:  ${teach2.delta.wireSize} chars (${teach2.delta.compression})`);
console.log(`  Skipped:  ${teach2.delta.skippedFunctions} fn (Claude already knows add)`);
console.log(`  Claude now knows: ${teach2.receiverNowKnows} functions`);
console.log();

// ── 6. Ask: what does each agent know? ──
console.log('── État des connaissances ──');
console.log();

const claudeKnows = call("tools/call", {
  name: "benoit_ask",
  arguments: { agent_id: "claude" }
});
console.log(`  Claude (${claudeKnows.totalFunctions} fn):`);
for (const f of claudeKnows.functions) {
  console.log(`    ${f.name}(${f.arity} args) — ${f.assertions} assertions known`);
}
console.log();

const gptKnows = call("tools/call", {
  name: "benoit_ask",
  arguments: { agent_id: "gpt" }
});
console.log(`  GPT (${gptKnows.totalFunctions} fn):`);
for (const f of gptKnows.functions) {
  console.log(`    ${f.name}(${f.arity} args) — ${f.assertions} assertions known`);
}
console.log();

// ── 7. Verify: zero-trust check ──
console.log('── Vérification zero-trust ──');
console.log();

const verifyGood = call("tools/call", {
  name: "benoit_verify",
  arguments: {
    source: `add a,b -> a + b
add(2,3) 5`
  }
});
console.log(`  "add(2,3) 5" → ${verifyGood.ok ? 'VERIFIED' : 'FAILED'}`);

const verifyBad = call("tools/call", {
  name: "benoit_verify",
  arguments: {
    source: `add a,b -> a + b
add(2,3) 999`
  }
});
console.log(`  "add(2,3) 999" → ${verifyBad.ok ? 'VERIFIED' : 'REJECTED'} — ${verifyBad.errors[0]}`);
console.log();

// ── 8. Second teach round: convergence ──
console.log('── Re-teach: convergence vers zéro ──');
const teach3 = call("tools/call", {
  name: "benoit_teach",
  arguments: {
    from_agent: "claude",
    to_agent: "gpt",
    source: `add a,b -> a + b
add(2,3) 5
multiply a,b -> a * b
multiply(3,4) 12
negate x -> -x
negate(5) -5
greet name -> "Hello {name}"
greet("world") "Hello world"
upper text -> text.toUpperCase()
len text -> text.length`
  }
});
console.log(`  Original: ${teach3.delta.originalSize} chars`);
console.log(`  On wire:  ${teach3.delta.wireSize} chars (${teach3.delta.compression})`);
console.log(`  Payload:  "${teach3.payload}"`);
console.log();

console.log('══════════════════════════════════════════════');
console.log('  RÉSULTAT');
console.log('══════════════════════════════════════════════');
console.log();
console.log('  Deux IA (Claude + GPT) viennent de:');
console.log('    1. Apprendre du .ben (code + preuves)');
console.log('    2. S\'enseigner mutuellement (delta)');
console.log('    3. Converger vers un savoir partagé');
console.log('    4. Vérifier chaque message (zero-trust)');
console.log('    5. Réduire la communication à ZÉRO');
console.log('       quand elles savent les mêmes choses');
console.log();
console.log('  Tout ça via MCP standard — pluggable');
console.log('  dans n\'importe quel framework d\'agents.');
console.log('══════════════════════════════════════════════');
