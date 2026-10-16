import test from "node:test";
import assert from "node:assert/strict";
import { createEntitiesInterpretation, entityTokens } from "./entities.js";

const text =
  "Nora Ivers of Willow & Finch briefed Mateo Silva at Helix Grid. Nora Ivers later emailed the revised proposal.";
const definitions =
  "Person: a named human\nOrganization: a named company or employer";

test("entity start candidates retain exact bounded source context at each unchanged token ID", () => {
  const spec = createEntitiesInterpretation({ text, definitions });
  const tokens = entityTokens(text);
  for (const question of Object.values(spec.questions)) {
    assert.equal(Object.keys(question.criteria).length, tokens.length + 1);
    assert.equal(question.criteria.none, "There is no such occurrence.");
    for (const [i, token] of tokens.entries()) {
      assert.deepEqual(question.criteria[token.id], {
        token: token.text,
        sourceOffset: token.start,
        followingSource: text.slice(
          token.start,
          tokens[Math.min(i + 4, tokens.length - 1)].end,
        ),
      });
    }
  }
  assert.deepEqual(spec.state.tokens, tokens);
  assert.equal(Object.keys(spec.questions).length, 6);
});
