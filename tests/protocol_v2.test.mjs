import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { send, receive, exchange, Knowledge, deltaSend, deltaReceive, PROTOCOL_VERSION } from "../src/protocol_v2.mjs";

describe("Protocol v2 — .ben IS the protocol", () => {
  const src = `add a,b -> a + b
add(2,3) 5
add(0,0) 0

double x -> x * 2
double(21) 42`;

  describe("send()", () => {
    it("wraps source as protocol message", () => {
      const msg = send(src);
      assert.equal(msg.protocol, PROTOCOL_VERSION);
      assert.equal(msg.payload, src);
      assert.equal(msg.meta.size, src.length);
    });

    it("includes sender metadata", () => {
      const msg = send(src, { sender: "agent-1" });
      assert.equal(msg.meta.sender, "agent-1");
    });

    it("payload IS the source — zero transformation", () => {
      const msg = send(src);
      assert.equal(msg.payload, src);
      assert.equal(msg.payload.length, src.length);
    });
  });

  describe("receive()", () => {
    it("transpiles .ben to JS", () => {
      const result = receive(src);
      assert.ok(result.js);
      assert.ok(result.js.includes("function add"));
      assert.ok(result.js.includes("function double"));
    });

    it("extracts and verifies assertions", () => {
      const result = receive(src);
      assert.equal(result.assertions.total, 3);
      assert.equal(result.assertions.passed, 3);
      assert.ok(result.ok);
    });

    it("detects function signatures", () => {
      const result = receive(src);
      const names = result.functions.map(f => f.name);
      assert.ok(names.includes("add"));
      assert.ok(names.includes("double"));
      assert.equal(result.functions.find(f => f.name === "add").arity, 2);
      assert.equal(result.functions.find(f => f.name === "double").arity, 1);
    });

    it("handles protocol message objects", () => {
      const msg = send(src);
      const result = receive(msg);
      assert.ok(result.ok);
      assert.equal(result.assertions.passed, 3);
    });

    it("reports errors for invalid source", () => {
      const result = receive("");
      assert.equal(result.ok, false);
      assert.ok(result.errors.length > 0);
    });

    it("reports assertion failures", () => {
      const bad = `add a,b -> a + b
add(2,3) 999`;
      const result = receive(bad);
      assert.equal(result.assertions.passed, 0);
      assert.equal(result.assertions.total, 1);
      assert.equal(result.ok, false);
    });
  });

  describe("exchange()", () => {
    it("full round-trip: send → receive → verify", () => {
      const { message, result, stats } = exchange(src);
      assert.equal(message.protocol, PROTOCOL_VERSION);
      assert.ok(result.ok);
      assert.equal(stats.assertionsPassed, 3);
      assert.equal(stats.assertionsTotal, 3);
      assert.ok(stats.wireSize > 0);
      assert.ok(stats.elapsed >= 0);
      assert.equal(stats.verified, true);
    });
  });

  describe("real-world .ben files", () => {
    it("handles complex .ben with error fallback", () => {
      const complex = `parse json -> JSON.parse(json) ! null
parse("{\\"a\\":1}") {"a":1}
parse("broken") null`;
      const result = receive(complex);
      assert.ok(result.js);
      assert.equal(result.functions.length, 1);
    });

    it("handles multiple function definitions", () => {
      const multi = `add a,b -> a + b
add(1,2) 3

negate x -> -x
negate(5) -5

double x -> x * 2
double(3) 6`;
      const result = receive(multi);
      assert.equal(result.functions.length, 3);
      assert.equal(result.assertions.total, 3);
      assert.equal(result.assertions.passed, 3);
      assert.ok(result.ok);
    });

    it("handles is-keyword assertions", () => {
      const isSrc = `add a,b -> a + b
add(2,3) is 5`;
      const result = receive(isSrc);
      assert.equal(result.assertions.total, 1);
      assert.equal(result.assertions.passed, 1);
    });

    it("handles private functions", () => {
      const priv = `_helper x -> x * 2
double x -> _helper(x)
double(3) 6`;
      const result = receive(priv);
      assert.ok(result.ok);
    });
  });

  describe("protocol properties", () => {
    it("wire size equals source size (zero overhead)", () => {
      const msg = send(src);
      assert.equal(msg.meta.size, src.length);
    });

    it("message is human-readable", () => {
      const msg = send(src);
      assert.ok(msg.payload.includes("add a,b -> a + b"));
      assert.ok(msg.payload.includes("double x -> x * 2"));
    });

    it("message contains both code AND proofs", () => {
      const msg = send(src);
      // Code
      assert.ok(msg.payload.includes("->"));
      // Proofs
      assert.ok(msg.payload.includes("add(2,3) 5"));
      assert.ok(msg.payload.includes("double(21) 42"));
    });

    it("receiver can execute without trusting sender", () => {
      const result = receive(src);
      // The receiver independently verified the assertions
      assert.ok(result.ok);
      assert.equal(result.assertions.passed, result.assertions.total);
      // The receiver has the actual JS to run
      assert.ok(result.js.includes("function add"));
    });
  });

  describe("Knowledge — shared state (quantum layer)", () => {
    it("absorbs functions from .ben source", () => {
      const k = new Knowledge();
      k.absorb(src);
      assert.equal(k.size, 2);
      assert.ok(k.knows("add"));
      assert.ok(k.knows("double"));
      assert.ok(!k.knows("unknown"));
    });

    it("knows assertions it has seen", () => {
      const k = new Knowledge();
      k.absorb(src);
      assert.ok(k.canDerive("add(2,3)", "5"));
      assert.ok(k.canDerive("add(0,0)", "0"));
      assert.ok(!k.canDerive("add(99,1)", "100"));
    });

    it("grows incrementally across multiple absorb calls", () => {
      const k = new Knowledge();
      k.absorb("add a,b -> a + b\nadd(1,2) 3");
      assert.equal(k.size, 1);
      k.absorb("negate x -> -x\nnegate(5) -5");
      assert.equal(k.size, 2);
      assert.ok(k.knows("add"));
      assert.ok(k.knows("negate"));
    });
  });

  describe("deltaSend — only transmit surprises", () => {
    it("sends everything when receiver knows nothing", () => {
      const k = new Knowledge();
      const msg = deltaSend(src, k);
      assert.equal(msg.delta.skippedFunctions, 0);
      assert.equal(msg.delta.skippedAssertions, 0);
      assert.equal(msg.payload.length, src.length);
    });

    it("skips known functions", () => {
      const k = new Knowledge();
      k.absorb(src);
      // Now send the SAME source — receiver already knows everything
      const msg = deltaSend(src, k);
      assert.ok(msg.delta.skippedFunctions > 0);
      assert.ok(msg.delta.deltaSize < msg.delta.originalSize);
    });

    it("skips known assertions", () => {
      const k = new Knowledge();
      k.absorb(src);
      const msg = deltaSend(src, k);
      assert.ok(msg.delta.skippedAssertions > 0);
    });

    it("transmits only NEW functions", () => {
      const k = new Knowledge();
      k.absorb("add a,b -> a + b\nadd(2,3) 5");

      const extended = `add a,b -> a + b
add(2,3) 5

negate x -> -x
negate(5) -5`;
      const msg = deltaSend(extended, k);
      // add is known, negate is new
      assert.ok(msg.delta.skippedFunctions >= 1);
      assert.ok(msg.payload.includes("negate"));
      assert.ok(!msg.payload.includes("add a,b -> a + b"));
    });

    it("compression ratio reflects shared knowledge", () => {
      const k = new Knowledge();
      k.absorb(src);
      const msg = deltaSend(src, k);
      const pct = parseInt(msg.delta.compression);
      // Should be significantly less than 100%
      assert.ok(pct < 100, `expected compression < 100%, got ${pct}%`);
    });
  });

  describe("deltaReceive — merge into knowledge", () => {
    it("absorbs new knowledge from delta", () => {
      const k = new Knowledge();
      const result = deltaReceive("add a,b -> a + b\nadd(2,3) 5", k);
      assert.ok(result.ok || result.assertions.passed > 0);
      assert.equal(result.knowledgeSize, 1);
      assert.ok(k.knows("add"));
    });

    it("two agents converge through exchange", () => {
      const agentA = new Knowledge();
      const agentB = new Knowledge();

      // Agent A knows add
      agentA.absorb("add a,b -> a + b\nadd(2,3) 5");
      // Agent B knows negate
      agentB.absorb("negate x -> -x\nnegate(5) -5");

      // A sends to B (only what B doesn't know)
      const msgAtoB = deltaSend("add a,b -> a + b\nadd(2,3) 5", agentB);
      deltaReceive(msgAtoB, agentB);

      // B sends to A (only what A doesn't know)
      const msgBtoA = deltaSend("negate x -> -x\nnegate(5) -5", agentA);
      deltaReceive(msgBtoA, agentA);

      // Both now know the same things
      assert.equal(agentA.size, 2);
      assert.equal(agentB.size, 2);
      assert.ok(agentA.knows("add") && agentA.knows("negate"));
      assert.ok(agentB.knows("add") && agentB.knows("negate"));
    });

    it("repeated exchange converges to zero delta", () => {
      const k = new Knowledge();
      k.absorb(src);

      // Send the same source again — delta should be minimal
      const msg1 = deltaSend(src, k);
      const msg2 = deltaSend(src, k);
      // Both deltas are the same (knowledge didn't change)
      assert.equal(msg1.delta.deltaSize, msg2.delta.deltaSize);
      // And both are smaller than the original
      assert.ok(msg1.delta.deltaSize < src.length);
    });
  });
});
