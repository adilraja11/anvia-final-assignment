import { Studio } from "@anvia/studio";
import { defaultModel } from "./providers/openai.js";
import { Agent } from "@anvia/core";
import { handbookSearch } from "./tools/handbook-search.js";
import { createWebTools } from "./tools/web-search.js";
import { BASE_INSTRUCTIONS } from "./prompts/base-instructions.js";

const agent = new Agent({
  id: 'support',
  model: defaultModel,
  name: 'Support',
  instructions: BASE_INSTRUCTIONS,
  tools: [ handbookSearch, ...createWebTools()],
  temperature: 0,
  maxTokens: 180,
  maxTurns: 4,
})

new Studio([agent]).start({
    hostname: 'localhost',
    port: 4021,
});